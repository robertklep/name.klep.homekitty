'use strict';

const { spawn }  = require('node:child_process');
const dgram      = require('node:dgram');
const os         = require('node:os');

const { CameraController } = require('../../modules/hap-nodejs');
const { resolveFfmpeg }    = require('./ffmpeg');
const { redact }           = require('./video-source');

// HomeKit negotiates an RTP session, then expects the accessory to push SRTP to
// the iOS device. ffmpeg does the work: it pulls RTSP from the camera and emits
// SRTP at the address HomeKit nominated.
//
// The video is copied rather than transcoded (`-c:v copy`). The cameras already
// produce H.264, and transcoding four streams on a Homey would not be viable.

// The address we advertise back to HomeKit must be one the controller can
// actually reach us on. A Homey has several interfaces, so "first non-internal"
// can easily name a network the iOS device is not on -- and the symptom is a
// live view that retries forever while the packets go somewhere else.
// Prefer the interface that shares a subnet with whoever is asking.
function localAddress(family = 'IPv4', targetAddress = null) {
  const candidates = [];

  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family !== family || address.internal) continue;
      if (targetAddress && address.cidr && sameSubnet(address.cidr, targetAddress)) {
        return address.address;
      }
      candidates.push(address.address);
    }
  }
  return candidates[0] || (family === 'IPv4' ? '127.0.0.1' : '::1');
}

// IPv4 only; IPv6 link-local scoping makes the same check unreliable, and the
// fallback ordering is good enough there.
function sameSubnet(cidr, target) {
  const [ address, bits ] = String(cidr).split('/');
  const prefix = Number(bits);
  if (! address.includes('.') || ! target.includes('.') || ! prefix) return false;

  const toInt = ip => ip.split('.').reduce((acc, part) => (acc << 8 >>> 0) + Number(part), 0) >>> 0;
  const mask  = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (toInt(address) & mask) === (toInt(target) & mask);
}

// HomeKit hands us a key and salt separately; ffmpeg wants them concatenated.
function srtpParams({ srtp_key, srtp_salt }) {
  return Buffer.concat([ srtp_key, srtp_salt ]).toString('base64');
}

// Binds a socket and KEEPS it. Closing it to "reserve" the port leaves nothing
// listening on the address we hand HomeKit: its RTCP then draws an ICMP
// port-unreachable, and the session is torn down almost as soon as it starts.
function reservePort() {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', reject);
    socket.bind(0, () => resolve({ socket, port : socket.address().port }));
  });
}

class RtspStreamSource {
  #getUrl;
  #log;
  #sessions = new Map();

  // `getUrl` is async and resolves the camera's current RTSP url, so a rotated
  // credential is picked up on the next stream rather than cached forever.
  constructor({ getUrl, log = () => {} }) {
    this.#getUrl = getUrl;
    this.#log    = log;
  }

  async prepare(request, callback) {
    try {
      const video     = await reservePort();
      const videoSSRC = CameraController.generateSynchronisationSource();
      const videoReturnPort = video.port;
      const sockets   = [ video.socket ];

      // HomeKit sends RTCP receiver reports here for the life of the stream.
      // We do not act on them, but the socket has to stay bound to receive them.
      video.socket.on('message', () => {});
      video.socket.on('error', () => {});

      this.#sessions.set(request.sessionID, {
        targetAddress : request.targetAddress,
        video         : { ...request.video, returnPort : videoReturnPort, ssrc : videoSSRC },
        sockets,
        process       : null,
      });

      const response = {
        address : localAddress(request.addressVersion === 'ipv6' ? 'IPv6' : 'IPv4', request.targetAddress),
        video   : {
          port      : videoReturnPort,
          ssrc      : videoSSRC,
          srtp_key  : request.video.srtp_key,
          srtp_salt : request.video.srtp_salt,
        },
      };

      // The accessory declares audio support (it must -- an accessory that
      // advertises audio with no Microphone service is rejected outright), so
      // HomeKit negotiates an audio stream as well. Answering with video only
      // leaves that half of the session unresolved and the view never starts.
      // We answer for audio and simply never send any: iOS tolerates a silent
      // stream, but not an unanswered one.
      if (request.audio) {
        const audio = await reservePort();
        audio.socket.on('message', () => {});
        audio.socket.on('error', () => {});
        sockets.push(audio.socket);

        response.audio = {
          port      : audio.port,
          ssrc      : CameraController.generateSynchronisationSource(),
          srtp_key  : request.audio.srtp_key,
          srtp_salt : request.audio.srtp_salt,
        };
      }

      callback(undefined, response);
    } catch (error) {
      this.#log(`prepare failed: ${ error.message }`);
      callback(error);
    }
  }

  async handle(request, callback) {
    const session = this.#sessions.get(request.sessionID);

    if (request.type === 'stop') {
      this.#teardown(request.sessionID);
      return callback();
    }
    if (! session) {
      return callback(Error(`unknown streaming session ${ request.sessionID }`));
    }
    if (request.type === 'reconfigure') {
      // Bitrate/framerate changes mid-stream; restarting ffmpeg for these
      // causes a visible stutter, and the copied stream ignores them anyway.
      return callback();
    }

    try {
      const [ url, ffmpeg ] = await Promise.all([ this.#getUrl(), resolveFfmpeg(this.#log) ]);
      if (! url) throw Error('camera has no RTSP stream');

      const target = `srtp://${ session.targetAddress }:${ request.video.port }` +
                     `?rtcpport=${ request.video.port }&pkt_size=1316`;

      // HomeKit asks for a specific resolution, framerate and bitrate, and
      // renders nothing when the stream does not match. Passing the camera's
      // feed through untouched (`-c:v copy`) ignores all three -- it would send
      // 1080p High profile whatever was negotiated -- so the stream is encoded
      // to the requested shape, as every working HomeKit camera does.
      const { width, height, fps, max_bit_rate : bitrate } = request.video;

      const args = [
        '-rtsp_transport', 'tcp',        // UDP loses too much over wifi
        '-i', url,
        '-an', '-sn', '-dn',             // video only: audio is negotiated separately
        '-codec:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-color_range', 'mpeg',
        ...(fps ? [ '-r', String(fps) ] : []),
        '-f', 'rawvideo',
        '-preset', 'ultrafast',          // a Homey cannot afford anything slower
        '-tune', 'zerolatency',
        ...(width && height ? [ '-filter:v', `scale=${ width }:${ height }` ] : []),
        ...(bitrate ? [ '-b:v', `${ bitrate }k`, '-bufsize', `${ bitrate * 2 }k`, '-maxrate', `${ bitrate }k` ] : []),
        '-payload_type', String(request.video.pt),
        '-ssrc', String(session.video.ssrc),
        '-f', 'rtp',
        '-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80',
        '-srtp_out_params', srtpParams(request.video),
        target,
      ];

      this.#log(`starting stream from ${ redact(url) }`);
      const proc = spawn(ffmpeg, args, { env : process.env });
      session.process = proc;

      let settled = false;
      const settle = error => {
        if (settled) return;
        settled = true;
        callback(error);
      };

      // ffmpeg reports progress on stderr; only surface it if it dies early.
      let stderr = '';
      proc.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });

      proc.on('error', error => {
        this.#log(`ffmpeg failed to start: ${ error.message }`);
        settle(error);
      });

      proc.on('exit', (code, signal) => {
        this.#sessions.delete(request.sessionID);
        if (signal === 'SIGKILL' || code === 0) return;       // our own teardown
        this.#log(`ffmpeg exited (${ code }): ${ stderr.split('\n').slice(-3).join(' ') }`);
        settle(Error(`ffmpeg exited with code ${ code }`));
      });

      // ffmpeg needs a moment to connect; if it survives that, treat the stream
      // as running. Waiting for first output would delay HomeKit past its
      // patience.
      setTimeout(() => settle(undefined), 1500).unref?.();
    } catch (error) {
      this.#log(`stream start failed: ${ error.message }`);
      this.#teardown(request.sessionID);
      callback(error);
    }
  }

  stop(sessionID) {
    this.#teardown(sessionID);
  }

  #teardown(sessionID) {
    const session = this.#sessions.get(sessionID);
    if (! session) return;
    if (session.process) {
      try { session.process.kill('SIGKILL'); } catch (e) { /* already gone */ }
    }
    for (const socket of session.sockets || []) {
      try { socket.close(); } catch (e) { /* already closed */ }
    }
    this.#sessions.delete(sessionID);
  }
}

module.exports = { RtspStreamSource, localAddress, srtpParams };
