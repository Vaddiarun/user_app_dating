import { useSyncExternalStore } from 'react'
import { io } from 'socket.io-client'
import { API_BASE_URL, getSession } from './api'
import { hostStatusFrom } from './normalize'

let socket = null

// hostId -> { online?, busy? }, from the backend's `presence:update` (host toggled online/offline
// or dropped their connection) and `host:busy` (host's call was accepted / ended) broadcasts, both
// sent to every socket. Screens fetch a host's isOnline/isBusy once; this overrides them live.
// Replaced (not mutated) on every change so it can be a useSyncExternalStore snapshot. Cleared on
// (re)connect, since events sent while this socket was down were missed — screens fall back to
// their fetched values until the next one.
let livePresence = {}
const presenceListeners = new Set()

function setLivePresence(next) {
  livePresence = next
  presenceListeners.forEach((fn) => fn())
}

function patchHostPresence(hostId, patch) {
  setLivePresence({ ...livePresence, [hostId]: { ...livePresence[hostId], ...patch } })
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
  socket.on('presence:update', ({ hostId, isOnline }) => patchHostPresence(hostId, { online: isOnline }))
  socket.on('host:busy', ({ hostId, isBusy }) => patchHostPresence(hostId, { busy: isBusy }))
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
  if (!s) return () => { }
  s.on(event, handler)
  return () => s.off(event, handler)
}

function subscribePresence(fn) {
  presenceListeners.add(fn)
  return () => presenceListeners.delete(fn)
}

/** A host's live status: 'busy' (in a call), 'online', or 'offline'. `host` is a normalizeHost
 * result (or null while loading) — its fetched `online`/`busy` are used until a realtime update
 * arrives. Busy wins over online/offline: a host in a call can't take another one either way. */
export function useHostStatus(hostId, host) {
  const presence = useSyncExternalStore(subscribePresence, () => livePresence)
  const live = presence[hostId] || {}
  const busy = live.busy ?? host?.busy ?? false
  const online = live.online ?? host?.online ?? false
  if (busy) return 'busy'
  return online ? 'online' : 'offline'
}
