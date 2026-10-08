import { useMemo, useSyncExternalStore } from 'react'
import { io } from 'socket.io-client'
import { API_BASE_URL, getSession } from './api'

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

// Whether the realtime connection is currently up — live presence only flows while it is.
let connected = false
const connectionListeners = new Set()

function setConnected(next) {
  if (connected === next) return
  connected = next
  connectionListeners.forEach((fn) => fn())
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
  socket.on('presence:update', ({ hostId, isOnline }) => {
    if (import.meta.env.DEV) console.info('[socket] presence:update', { hostId, isOnline })
    patchHostPresence(hostId, { online: isOnline })
  })
  socket.on('host:busy', ({ hostId, isBusy }) => {
    if (import.meta.env.DEV) console.info('[socket] host:busy', { hostId, isBusy })
    patchHostPresence(hostId, { busy: isBusy })
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
  if (!s) return () => { }
  s.on(event, handler)
  return () => s.off(event, handler)
}

function subscribeConnection(fn) {
  connectionListeners.add(fn)
  return () => connectionListeners.delete(fn)
}

/** Whether the realtime socket is currently connected. */
export function useSocketConnected() {
  return useSyncExternalStore(subscribeConnection, () => connected)
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
  return hostStatusFrom(presence, hostId, host)
}

function hostStatusFrom(presence, hostId, host) {
  const live = presence[hostId] || {}
  const busy = live.busy ?? host?.busy ?? false
  const online = live.online ?? host?.online ?? false
  if (busy) return 'busy'
  return online ? 'online' : 'offline'
}

const STATUS_ORDER = { online: 0, busy: 1, offline: 2 }

/** `hosts` sorted online first, then busy (in a call), then offline — re-sorted live as presence
 * changes. Within each group the original order (e.g. Popular's rating order) is kept. */
export function useHostsByStatus(hosts) {
  const presence = useSyncExternalStore(subscribePresence, () => livePresence)
  return useMemo(
    () => hosts
      .map((h, i) => ({ h, i, rank: STATUS_ORDER[hostStatusFrom(presence, h.id, h)] }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map((x) => x.h),
    [hosts, presence],
  )
}
