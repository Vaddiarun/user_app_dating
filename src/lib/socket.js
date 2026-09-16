import { io } from 'socket.io-client'
import { API_BASE_URL, getSession } from './api'

let socket = null

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
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
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
