/**
 * Direct (peer-to-peer) WebRTC calls — the backend's "p2p" media provider, the low-cost
 * alternative to Agora for 1:1 calls. Audio/video flows straight between the two devices
 * (or through a TURN relay when a network blocks that); the backend only relays the
 * connection-setup messages (POST /calls/:id/signal -> `call:signal` on the other side).
 *
 * The session this returns has the same shape the call screens already use for an Agora
 * session — `client.leave()`, and tracks with play/stop/close/setEnabled/setDevice — so
 * leaveChannel(), mute and camera flip work unchanged whichever provider a call uses.
 *
 * Setup handshake: both sides send `hello` once their media is ready. The caller (offerer)
 * sends the offer only after hearing the host's hello, and the host answers a hello with one
 * of its own — so whichever side's screen loads first, the offer is never sent to a peer
 * that isn't listening yet.
 */

// 720p stays within what the Agora path sends too; capping the bitrate bounds how much a
// relayed (TURN, billed per GB) call can cost without visibly hurting a phone-sized video.
const CAMERA_CONSTRAINTS = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15, max: 30 } }
const MAX_VIDEO_BITRATE = 1_200_000
const MAX_ICE_RESTARTS = 3
// "auto" calls: how long a direct connection gets before the call moves to Agora (see
// onUnrecoverable below). Both sides join within a second or two of the accept, and a
// direct connection is normally up in 1-3s, so this only trips when it really can't connect.
const CONNECT_TIMEOUT_MS = 12_000
const RECOVER_TIMEOUT_MS = 15_000

/** Plays a MediaStreamTrack into a container element the way Agora's track.play() does:
 * a <video> filling the container, created on first play and reused after. */
function playVideo(track, container, { fit = 'cover', mirror = false } = {}) {
  if (!container) return null
  container.querySelector(':scope > video[data-p2p]')?.remove()
  const el = document.createElement('video')
  el.dataset.p2p = ''
  el.autoplay = true
  el.playsInline = true
  el.muted = true // audio plays through its own element; a video element never carries sound here
  el.srcObject = new MediaStream([track])
  el.style.cssText = `width:100%;height:100%;object-fit:${fit};${mirror ? 'transform:scaleX(-1);' : ''}`
  container.appendChild(el)
  el.play().catch(() => {})
  return el
}

function localVideoTrack(initialTrack, getSender) {
  let track = initialTrack
  let el = null
  let lastPlay = null
  return {
    getMediaStreamTrack: () => track,
    // Local self-view is mirrored by default, matching Agora's local tracks.
    play(container, config = {}) {
      lastPlay = [container, { mirror: true, ...config }]
      el = playVideo(track, ...lastPlay)
    },
    stop() { el?.remove(); el = null },
    close() { track.stop() },
    setEnabled(enabled) { track.enabled = enabled },
    // Same call shapes as Agora's setDevice: a deviceId string, or { facingMode }.
    async setDevice(target) {
      const video = typeof target === 'string'
        ? { ...CAMERA_CONSTRAINTS, deviceId: { exact: target } }
        : { ...CAMERA_CONSTRAINTS, facingMode: { exact: target.facingMode } }
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false })
      const next = stream.getVideoTracks()[0]
      next.enabled = track.enabled
      await getSender()?.replaceTrack(next)
      track.stop()
      track = next
      if (el && lastPlay) el = playVideo(track, ...lastPlay)
    },
  }
}

function localAudioTrack(track) {
  return {
    getMediaStreamTrack: () => track,
    setEnabled(enabled) { track.enabled = enabled },
    stop() {},
    close() { track.stop() },
  }
}

// Exported for lib/sfu.js too — remote tracks shaped like Agora's (play/stop).
export function remoteVideoTrack(track) {
  let el = null
  return {
    play(container, config) { el = playVideo(track, container, config) },
    stop() { el?.remove(); el = null },
  }
}

export function remoteAudioTrack(track) {
  const el = new Audio()
  el.autoplay = true
  el.srcObject = new MediaStream([track])
  return {
    play() { el.play().catch(() => {}) },
    stop() { el.pause(); el.srcObject = null },
  }
}

/**
 * @param role 'offerer' (the caller, User app) | 'answerer' (the host)
 * @param sendSignal (data) => Promise — POST /calls/:id/signal
 * @param onSignal (handler) => unsubscribe — `call:signal` events for this call, handler(data)
 * @param onRemoteUser (user, mediaType, left) — same contract as lib/agora.js
 * @param onUnrecoverable optional () => void — "auto" calls only (the backend can move them to
 *   Agora). Called once if the direct connection isn't up within CONNECT_TIMEOUT_MS, or drops
 *   and doesn't recover within RECOVER_TIMEOUT_MS. Without it, p2p just keeps retrying.
 */
export async function joinP2P({ iceServers, role, video = true, sendSignal, onSignal, onRemoteUser, onUnrecoverable }) {
  const pc = new RTCPeerConnection({ iceServers })
  const remoteUser = { videoTrack: null, audioTrack: null }
  let offered = false
  let helloReplied = false
  let iceRestarts = 0
  const pendingCandidates = []
  let startedAt = null // once local media is ready — connect time measures the network, not a permission prompt
  let connectedAt = null
  let gaveUp = false
  let giveUpTimer = null

  const armGiveUp = (ms) => {
    if (!onUnrecoverable || gaveUp) return
    clearTimeout(giveUpTimer)
    giveUpTimer = setTimeout(() => {
      gaveUp = true
      onUnrecoverable()
    }, ms)
  }

  const send = (data) => sendSignal(data).catch((e) => console.error('p2p signal failed:', e))

  const sendOffer = async (iceRestart = false) => {
    const offer = await pc.createOffer({ iceRestart })
    await pc.setLocalDescription(offer)
    await send({ type: 'offer', sdp: offer.sdp })
  }

  const flushCandidates = async () => {
    while (pendingCandidates.length) await pc.addIceCandidate(pendingCandidates.shift()).catch(() => {})
  }

  const handle = async (data) => {
    if (data.type === 'hello') {
      if (role === 'offerer' && !offered) { offered = true; await sendOffer() }
      if (role === 'answerer' && !helloReplied) { helloReplied = true; await send({ type: 'hello' }) }
    } else if (data.type === 'offer' && role === 'answerer') {
      await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await send({ type: 'answer', sdp: answer.sdp })
      await flushCandidates()
    } else if (data.type === 'answer' && role === 'offerer') {
      await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp })
      await flushCandidates()
    } else if (data.type === 'candidate') {
      if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {})
      else pendingCandidates.push(data.candidate)
    }
  }

  // Subscribe before acquiring media so nothing sent meanwhile is dropped; messages are
  // processed strictly in order, and only once local tracks are attached.
  let markReady
  let queue = new Promise((resolve) => { markReady = resolve })
  const unsubscribe = onSignal((data) => {
    queue = queue.then(() => handle(data)).catch((e) => console.error('p2p signal handling failed:', e))
  })

  pc.onicecandidate = (e) => { if (e.candidate) send({ type: 'candidate', candidate: e.candidate.toJSON() }) }
  pc.ontrack = (e) => {
    const kind = e.track.kind
    if (kind === 'video') remoteUser.videoTrack = remoteVideoTrack(e.track)
    else remoteUser.audioTrack = remoteAudioTrack(e.track)
    onRemoteUser?.(remoteUser, kind)
  }
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState
    if (state === 'connected') {
      clearTimeout(giveUpTimer)
      if (connectedAt === null) connectedAt = Date.now()
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
      const params = sender?.getParameters()
      if (params?.encodings?.length) {
        params.encodings[0].maxBitrate = MAX_VIDEO_BITRATE
        sender.setParameters(params).catch(() => {})
      }
    } else if ((state === 'disconnected' || state === 'failed') && connectedAt !== null) {
      armGiveUp(RECOVER_TIMEOUT_MS)
    }
    if (state === 'failed') {
      onRemoteUser?.(remoteUser, 'video', true)
      if (role === 'offerer' && iceRestarts < MAX_ICE_RESTARTS) {
        iceRestarts += 1
        sendOffer(true).catch((e) => console.error('p2p ICE restart failed:', e))
      }
    }
  }

  // Mic and camera acquired independently, as in lib/agora.js — a camera failure must not
  // take audio down with it.
  let audioStreamTrack
  try {
    audioStreamTrack = (await navigator.mediaDevices.getUserMedia({ audio: true })).getAudioTracks()[0]
  } catch (e) {
    clearTimeout(giveUpTimer)
    unsubscribe()
    pc.close()
    throw e
  }
  let videoStreamTrack = null
  let videoError = null
  if (video) {
    try {
      videoStreamTrack = (await navigator.mediaDevices.getUserMedia({ video: { ...CAMERA_CONSTRAINTS, facingMode: 'user' } })).getVideoTracks()[0]
    } catch (e) {
      videoError = e
    }
  }

  const stream = new MediaStream([audioStreamTrack, videoStreamTrack].filter(Boolean))
  pc.addTrack(audioStreamTrack, stream)
  const videoSender = videoStreamTrack ? pc.addTrack(videoStreamTrack, stream) : null

  markReady()
  send({ type: 'hello' })
  startedAt = Date.now()
  armGiveUp(CONNECT_TIMEOUT_MS)

  return {
    kind: 'p2p',
    client: {
      async leave() {
        clearTimeout(giveUpTimer)
        gaveUp = true
        unsubscribe()
        remoteUser.audioTrack?.stop()
        remoteUser.videoTrack?.stop()
        pc.close()
      },
    },
    localAudioTrack: localAudioTrack(audioStreamTrack),
    localVideoTrack: videoStreamTrack ? localVideoTrack(videoStreamTrack, () => videoSender) : null,
    videoError,
    /** Summary for POST /calls/:id/media-report — call before leave(). */
    getStats: () => summariseP2PStats(pc, startedAt, connectedAt),
  }
}

/** Averages over the whole call, from WebRTC's cumulative counters. */
async function summariseP2PStats(pc, startedAt, connectedAt) {
  const report = { connected: connectedAt !== null }
  if (connectedAt !== null) report.connectMs = connectedAt - startedAt
  const stats = await pc.getStats()
  let pair = null
  stats.forEach((s) => {
    if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId)
  })
  if (!pair) stats.forEach((s) => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s })
  if (pair) {
    const local = stats.get(pair.localCandidateId)
    const remote = stats.get(pair.remoteCandidateId)
    report.relayed = local?.candidateType === 'relay' || remote?.candidateType === 'relay'
    if (pair.responsesReceived) report.avgRttMs = Math.round((pair.totalRoundTripTime / pair.responsesReceived) * 1000)
  }
  stats.forEach((s) => {
    if (s.type !== 'inbound-rtp' || s.kind !== 'video') return
    const total = (s.packetsReceived || 0) + (s.packetsLost || 0)
    if (total) report.packetLossPercent = Math.round((10000 * (s.packetsLost || 0)) / total) / 100
    const seconds = connectedAt !== null ? (Date.now() - connectedAt) / 1000 : 0
    if (seconds > 0 && s.bytesReceived) report.avgVideoKbps = Math.round((s.bytesReceived * 8) / 1000 / seconds)
  })
  return report
}

/** Front/back camera flip for a p2p session — the p2p counterpart of lib/agora.js's
 * switchCameraFacing (which works through Agora's client.publish). Swaps the camera in
 * place on the existing connection; returns the same track object. */
export async function switchCameraFacingP2P(track, facingMode) {
  await track.setDevice({ facingMode })
  return track
}

/** Camera list without loading the Agora SDK. */
export async function listCamerasP2P() {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'videoinput')
}
