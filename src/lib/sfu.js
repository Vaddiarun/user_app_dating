/**
 * Watching a live broadcast through Cloudflare's SFU — the backend's "cloudflare" live media
 * provider, the per-GB-billed alternative to Agora. The host's app pushes one stream to the
 * SFU; this pulls it. Every SFU call goes through our backend (the SFU secret never reaches
 * the app): POST .../sfu/subscribe returns the SFU's offer, we answer via POST .../sfu/answer.
 *
 * Returns a session shaped like lib/agora.js's audience session — `client.leave()` — so the
 * Live screen's teardown works unchanged. `onRemoteUser(user, mediaType, left)` follows the
 * same contract too.
 */
import { remoteAudioTrack, remoteVideoTrack } from './p2p'

// The host's app may still be publishing when a viewer opens the stream (the backend answers
// 409 until it has); `live:media-updated` also triggers a re-pull, this just covers the gap.
const NOT_READY_RETRY_MS = 2000
const NOT_READY_MAX_TRIES = 15

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * @param subscribe () => Promise<{ sessionId, sdp }> — POST /live/broadcasts/:id/sfu/subscribe
 * @param answer (sessionId, sdp) => Promise — POST /live/broadcasts/:id/sfu/answer
 */
export async function watchSfuBroadcast({ iceServers, subscribe, answer, onRemoteUser }) {
  let pc = null
  let closed = false
  const remoteUser = { videoTrack: null, audioTrack: null, hasVideo: false }

  const teardown = () => {
    remoteUser.audioTrack?.stop()
    remoteUser.videoTrack?.stop()
    remoteUser.videoTrack = null
    remoteUser.audioTrack = null
    pc?.close()
    pc = null
  }

  // One SFU session per peer connection, so (re)pulling always starts a fresh one.
  const pull = async () => {
    teardown()
    // max-bundle: the SFU carries every track over one transport.
    const next = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' })
    pc = next
    next.ontrack = (e) => {
      const kind = e.track.kind
      if (kind === 'video') {
        remoteUser.videoTrack = remoteVideoTrack(e.track)
        remoteUser.hasVideo = true
      } else {
        remoteUser.audioTrack = remoteAudioTrack(e.track)
      }
      onRemoteUser?.(remoteUser, kind)
    }

    let offer = null
    for (let tries = 1; ; tries += 1) {
      try {
        offer = await subscribe()
        break
      } catch (e) {
        if (e?.status !== 409 || tries >= NOT_READY_MAX_TRIES || closed || pc !== next) throw e
        await sleep(NOT_READY_RETRY_MS)
      }
    }
    if (closed || pc !== next || !offer.sdp) return
    await next.setRemoteDescription({ type: 'offer', sdp: offer.sdp })
    const local = await next.createAnswer()
    await next.setLocalDescription(local)
    await answer(offer.sessionId, local.sdp)
  }

  await pull()

  return {
    kind: 'sfu',
    client: {
      async leave() {
        closed = true
        teardown()
      },
    },
    /** The host republished (live:media-updated) — pull their new tracks. */
    repull: () => pull(),
    // Pausing video for a hidden app is Agora-only (where it changes the per-minute rate):
    // the SFU would need a renegotiation round-trip through the backend for it.
    setVideoReceiving: async () => {},
  }
}
