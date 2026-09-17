import { inflate } from 'pako'

// Loaded on demand — the SDK is a big chunk (~500KB) that only the call screen needs,
// not every page in the app.
let AgoraRTC
async function sdk() {
  if (!AgoraRTC) AgoraRTC = (await import('agora-rtc-sdk-ng')).default
  return AgoraRTC
}

/**
 * The backend hands us a per-session Agora token (channelName + agoraToken) but never the
 * Agora App ID itself, and there's no /config endpoint that exposes it either. The App ID is
 * not a secret — it's meant to be embedded in client apps — and it's actually encoded inside
 * every token the backend issues (Agora's "007" token format: 3-byte version, then a
 * zlib-deflated, length-prefixed field list starting with signature, then appId). So rather
 * than hardcode a value that could drift from whatever Agora project the backend is actually
 * using, we decode it straight out of the token we already have.
 */
export function appIdFromToken(token) {
  const raw = Uint8Array.from(atob(token.slice(3)), (c) => c.charCodeAt(0))
  const bytes = inflate(raw)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let o = 0
  const sigLen = view.getUint16(o, true); o += 2 + sigLen
  const appIdLen = view.getUint16(o, true); o += 2
  return new TextDecoder().decode(bytes.slice(o, o + appIdLen))
}

/** Joins an Agora RTC channel, publishes the local mic + camera, and returns everything
 * needed to render/control the session. `onRemoteUser(user, mediaType)` fires whenever a
 * remote participant's audio/video becomes available, already subscribed. */
export async function joinAndPublish({ channelName, token, uid, video = true, onRemoteUser } = {}) {
  const RTC = await sdk()
  RTC.setLogLevel(4) // errors only — the SDK is chatty at its default level
  const appId = appIdFromToken(token)
  const client = RTC.createClient({ mode: 'rtc', codec: 'vp8' })

  if (onRemoteUser) {
    client.on('user-published', async (user, mediaType) => {
      await client.subscribe(user, mediaType)
      onRemoteUser(user, mediaType)
    })
    client.on('user-unpublished', (user, mediaType) => onRemoteUser(user, mediaType, true))
  }

  await client.join(appId, channelName, token, uid ?? null)

  // Mic and camera are acquired independently — a camera failure (permission
  // timing, already in use by another app/tab, no device at all) must not take
  // audio down with it. Previously this was one sequential `await` chain: if
  // createCameraVideoTrack() rejected, the whole join rejected, nothing ever
  // published, and the user only ever saw the *other* participant (whose stream
  // arrives independently of whether this side published anything).
  const localAudioTrack = await RTC.createMicrophoneAudioTrack()
  let localVideoTrack = null
  let videoError = null
  if (video) {
    try {
      localVideoTrack = await RTC.createCameraVideoTrack()
    } catch (e) {
      videoError = e
    }
  }
  await client.publish([localAudioTrack, localVideoTrack].filter(Boolean))

  return { client, localAudioTrack, localVideoTrack, videoError }
}

/** Joins an Agora RTC channel purely to watch/listen — never acquires the local
 * mic/camera or publishes anything. For live-broadcast viewers, who share the
 * same 'rtc'-mode channel as the host but must never be prompted for their own
 * camera/mic permissions just to watch. */
export async function joinAsAudience({ channelName, token, uid, onRemoteUser } = {}) {
  const RTC = await sdk()
  RTC.setLogLevel(4)
  const appId = appIdFromToken(token)
  const client = RTC.createClient({ mode: 'rtc', codec: 'vp8' })

  if (onRemoteUser) {
    client.on('user-published', async (user, mediaType) => {
      await client.subscribe(user, mediaType)
      onRemoteUser(user, mediaType)
    })
    client.on('user-unpublished', (user, mediaType) => onRemoteUser(user, mediaType, true))
  }

  await client.join(appId, channelName, token, uid ?? null)
  return { client }
}

/** Lists available camera input devices — used to know whether a flip-camera
 * control has anything to switch to (most desktops only have one). */
export async function listCameras() {
  const RTC = await sdk()
  return RTC.getCameras()
}

/** Switches a live local video track to a different camera device in place —
 * the track keeps publishing under the same UID, so remote viewers see a
 * seamless switch instead of a drop/rejoin. */
export async function switchCamera(localVideoTrack, deviceId) {
  if (!localVideoTrack) return
  await localVideoTrack.setDevice(deviceId)
}

// Fill the given element edge-to-edge, cropping instead of letterboxing —
// without this Agora's default can pillarbox/letterbox a track whose aspect
// ratio doesn't match the container, showing black bars on the sides.
export const PLAY_CONFIG = { fit: 'cover' }

export async function leaveChannel({ client, localAudioTrack, localVideoTrack } = {}) {
  try {
    if (localAudioTrack) { localAudioTrack.stop(); localAudioTrack.close() }
    if (localVideoTrack) { localVideoTrack.stop(); localVideoTrack.close() }
    await client?.leave()
  } catch {
    // best-effort — we're tearing down regardless
  }
}
