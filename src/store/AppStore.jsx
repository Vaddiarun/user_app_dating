import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  authApi, meApi, walletApi, moderationApi, hostsApi,
  isAuthenticated, onSessionChange, setSession, clearSession,
} from '../lib/api'
import { connectSocket, disconnectSocket } from '../lib/socket'

const NOTIF_KEY = 'vibe-notifications-v1'
const uid = () => Math.random().toString(36).slice(2, 10)

function loadNotifications() {
  try {
    const raw = localStorage.getItem(NOTIF_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

const initialState = {
  authStatus: isAuthenticated() ? 'checking' : 'guest', // checking | guest | authenticated
  user: null,
  wallet: null, // { balancePaise, displayBeans }
  notifPrefs: null,
  blocked: [], // [{ id, name, ts }]
  following: [], // [hostId]
  notifications: loadNotifications(),
}

function reducer(state, action) {
  switch (action.type) {
    case 'boot/checking':
      return { ...state, authStatus: 'checking' }
    case 'boot/error':
      return { ...state, authStatus: 'error' }
    case 'session/set':
      return {
        ...state,
        authStatus: 'authenticated',
        user: action.user,
        wallet: action.wallet ?? state.wallet,
        notifPrefs: action.notifPrefs ?? state.notifPrefs,
        blocked: action.blocked ?? state.blocked,
        following: action.following ?? state.following,
      }
    case 'session/clear':
      return { ...initialState, authStatus: 'guest', notifications: state.notifications }

    case 'user/set':
      return { ...state, user: action.user }
    case 'user/patch':
      return { ...state, user: { ...state.user, ...action.patch } }
    case 'wallet/set':
      return { ...state, wallet: action.wallet }
    case 'notifPrefs/set':
      return { ...state, notifPrefs: action.prefs }

    case 'blocked/set':
      return { ...state, blocked: action.list }
    case 'blocked/add':
      if (state.blocked.some((b) => b.id === action.id)) return state
      return {
        ...state,
        following: state.following.filter((x) => x !== action.id),
        blocked: [{ id: action.id, name: action.name || 'Creator', ts: Date.now() }, ...state.blocked],
      }
    case 'blocked/remove':
      return { ...state, blocked: state.blocked.filter((b) => b.id !== action.id) }

    case 'following/set':
      return { ...state, following: action.ids }
    case 'following/add':
      return state.following.includes(action.id) ? state : { ...state, following: [...state.following, action.id] }
    case 'following/remove':
      return { ...state, following: state.following.filter((x) => x !== action.id) }

    case 'notif/add':
      return { ...state, notifications: [{ id: uid(), ts: Date.now(), read: false, ...action.notif }, ...state.notifications].slice(0, 40) }
    case 'notif/readAll':
      return { ...state, notifications: state.notifications.map((n) => ({ ...n, read: true })) }

    default:
      return state
  }
}

const Ctx = createContext(null)

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(NOTIF_KEY, JSON.stringify(state.notifications)) } catch {}
    }, 200)
    return () => clearTimeout(t)
  }, [state.notifications])

  const toast = useRef((msg, opts = {}) => {
    const id = uid()
    setToasts((t) => [...t, { id, msg, ...opts }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.duration || 2600)
  }).current

  const loadProfile = useRef(async () => {
    dispatch({ type: 'boot/checking' })
    try {
      const [user, wallet, notifPrefs, blockedRes] = await Promise.all([
        meApi.get(),
        walletApi.get().catch(() => null),
        meApi.notificationPrefs().catch(() => null),
        moderationApi.listBlocked().catch(() => ({ blocks: [] })),
      ])
      let following = []
      try {
        const f = await meApi.following()
        following = (f.hosts || f.following || []).map((h) => h.id || h.hostId || h)
      } catch {}
      const blocked = (blockedRes.blocks || blockedRes.users || []).map((b) => ({
        id: b.id || b.userId || b.hostId,
        name: b.name || b.displayName || 'Creator',
        ts: b.blockedAt ? new Date(b.blockedAt).getTime() : Date.now(),
      }))
      dispatch({ type: 'session/set', user, wallet, notifPrefs, blocked, following })
    } catch (err) {
      // A 401 that couldn't be refreshed already wipes the session inside api.js —
      // that's a real "you're logged out" case. Anything else (network down, 5xx)
      // is transient: keep the token and let the user retry instead of forcing them
      // back through login.
      if (!isAuthenticated()) {
        dispatch({ type: 'session/clear' })
      } else {
        dispatch({ type: 'boot/error' })
      }
    }
  }).current

  // boot + react to the session being cleared from anywhere — logout, delete account,
  // a forced 401 that couldn't be refreshed, or a logout in another browser tab.
  // (Token refresh also flows through here, but that only ever updates the
  // accessToken in place — it never clears it — so it's a no-op for this listener.)
  useEffect(() => {
    if (isAuthenticated()) loadProfile()
    const unsub = onSessionChange((s) => {
      if (!s.accessToken) dispatch({ type: 'session/clear' })
    })
    return unsub
  }, []) // eslint-disable-line

  // Realtime connection follows auth status, same as the host app — connected
  // for call:accepted/call:ended (CallRoom.jsx) and available for future
  // realtime features (gifts, notifications) without another wiring pass.
  useEffect(() => {
    if (state.authStatus === 'authenticated') connectSocket()
    else disconnectSocket()
  }, [state.authStatus])

  const actions = useMemo(() => ({
    retryBoot: loadProfile,
    async login({ accessToken, refreshToken, userId }) {
      setSession({ accessToken, refreshToken, userId })
      await loadProfile()
    },
    async logout() {
      try { await authApi.logout() } catch {}
      clearSession()
      dispatch({ type: 'session/clear' })
    },
    async deleteAccount() {
      await meApi.deleteAccount()
      clearSession()
      dispatch({ type: 'session/clear' })
    },
    async refreshUser() {
      const user = await meApi.get()
      dispatch({ type: 'user/set', user })
      return user
    },
    patchUserLocal(patch) {
      dispatch({ type: 'user/patch', patch })
    },
    async refreshWallet() {
      const wallet = await walletApi.get()
      dispatch({ type: 'wallet/set', wallet })
      return wallet
    },
    async updateNotifPrefs(patch) {
      const prefs = await meApi.updateNotificationPrefs(patch)
      dispatch({ type: 'notifPrefs/set', prefs })
      return prefs
    },
    async follow(hostId) {
      dispatch({ type: 'following/add', id: hostId })
      try {
        await hostsApi.follow(hostId)
      } catch (err) {
        dispatch({ type: 'following/remove', id: hostId })
        throw err
      }
    },
    async unfollow(hostId) {
      dispatch({ type: 'following/remove', id: hostId })
      try {
        await hostsApi.unfollow(hostId)
      } catch (err) {
        dispatch({ type: 'following/add', id: hostId })
        throw err
      }
    },
    async block(hostId, name) {
      await moderationApi.block(hostId)
      dispatch({ type: 'blocked/add', id: hostId, name })
    },
    async unblock(hostId) {
      await moderationApi.unblock(hostId)
      dispatch({ type: 'blocked/remove', id: hostId })
    },
    addNotification(notif) {
      dispatch({ type: 'notif/add', notif })
    },
  }), []) // eslint-disable-line

  const value = useMemo(() => ({ state, dispatch, toast, toasts, actions }), [state, toasts, actions])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside provider')
  return v
}

export const genUid = uid
