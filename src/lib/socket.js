import { useSyncExternalStore } from 'react'
import { io } from 'socket.io-client'
import { API_BASE_URL, getSession } from './api'
import { hostStatusFrom } from './normalize'

let socket = null

// hostId -> 'online' | 'busy' | 'offline', from the backend's `presence:update` broadcast
// (sent to every socket whenever a host toggles online/offline, goes into / out of a call,
// or drops their connection). Screens fetch a host's status once; this overrides it live.
// Replaced (not mutated) on every change so it can be a useSyncExternalStore snapshot.
// Cleared on (re)connect, since events sent while this socket was down were missed —
// screens fall back to their fetched value until the next one.
let livePresence = {}
const presenceListeners = new Set()

function setLivePresence(next) {
  livePresence = next
  presenceListeners.forEach((fn) => fn())
}

// Whether the realtime connection is currently up — live presence only flows while it is.
let connected = false
const connectionListeners = new Set()

function setConnected(next) {
  if (connected === next) return
  connected = next
  connectionListeners.forEach((fn) => fn())
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
  socket.on('connect', () => {
    if (import.meta.env.DEV) console.info('[socket] connected', socket.id)
    setLivePresence({})
    setConnected(true)
  })
  socket.on('disconnect', (reason) => {
    if (import.meta.env.DEV) console.info('[socket] disconnected:', reason)
    setConnected(false)
  })
  socket.on('connect_error', (err) => {
    if (import.meta.env.DEV) console.warn('[socket] connect error:', err?.message)
    setConnected(false)
  })
  socket.on('presence:update', (payload) => {
    if (import.meta.env.DEV) console.info('[socket] presence:update', payload)
    const hostId = payload?.hostId
    if (!hostId) return
    setLivePresence({ ...livePresence, [hostId]: hostStatusFrom(payload) })
  })
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
  setLivePresence({})
  setConnected(false)
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

function subscribeConnection(fn) {
  connectionListeners.add(fn)
  return () => connectionListeners.delete(fn)
}

/** A host's status — 'online' | 'busy' | 'offline' — kept live by `presence:update`.
 * `fetchedStatus` is what the screen got from the REST API (normalizeHost's `status`), used
 * until a realtime update arrives. */
export function useHostStatus(hostId, fetchedStatus) {
  const presence = useSyncExternalStore(subscribePresence, () => livePresence)
  return presence[hostId] ?? fetchedStatus ?? 'offline'
}

/** Whether the realtime socket is currently connected. */
export function useSocketConnected() {
  return useSyncExternalStore(subscribeConnection, () => connected)
}
