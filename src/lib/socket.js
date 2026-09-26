import { useSyncExternalStore } from 'react'
import { io } from 'socket.io-client'
import { API_BASE_URL, getSession } from './api'

let socket = null

// hostId -> isOnline, from the backend's `presence:update` broadcast (sent to every socket
// whenever a host toggles online/offline or drops their connection). Screens fetch a host's
// isOnline once; this overrides it live. Replaced (not mutated) on every change so it can be
// a useSyncExternalStore snapshot. Cleared on (re)connect, since events sent while this
// socket was down were missed — screens fall back to their fetched value until the next one.
let livePresence = {}
const presenceListeners = new Set()

function setLivePresence(next) {
  livePresence = next
  presenceListeners.forEach((fn) => fn())
}

/** Opens (or reuses) the realtime connection, authenticating with whatever access token is
 * current at connect/reconnect time — `auth` as a callback so a token refresh is picked up
 * without tearing the socket down. Mirrors the host app's src/lib/socket.js. */
export function connectSocket() {
  const { accessToken } = getSession()
  if (!accessToken) return null
  if (socket) return socket
  socket = io(API_BASE_URL, {
    auth: (cb) => cb({ token: getSession().accessToken }),
    reconnection: true,
    reconnectionDelay: 1500,
  })
  // Attached here, once per socket, rather than from a screen's effect — presence has to be
  // tracked for the whole session, not just while one particular screen is mounted.
  socket.on('connect', () => setLivePresence({}))
  socket.on('presence:update', ({ hostId, isOnline }) => {
    setLivePresence({ ...livePresence, [hostId]: isOnline })
  })
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
  setLivePresence({})
}

export function getSocket() {
  return socket
}

/** Subscribe to a realtime event; returns an unsubscribe function. Safe to call before the
 * socket connects — it attaches lazily via getSocket() at call time, so prefer calling this
 * from an effect that retries until the socket exists (see CallRoom.jsx). */
export function onSocketEvent(event, handler) {
  const s = getSocket()
  if (!s) return () => {}
  s.on(event, handler)
  return () => s.off(event, handler)
}

function subscribePresence(fn) {
  presenceListeners.add(fn)
  return () => presenceListeners.delete(fn)
}

/** A host's online status, kept live by `presence:update`. `fetchedOnline` is what the screen
 * got from the REST API (normalizeHost's `online`), used until a realtime update arrives. */
export function useHostOnline(hostId, fetchedOnline) {
  const presence = useSyncExternalStore(subscribePresence, () => livePresence)
  return presence[hostId] ?? fetchedOnline
}
