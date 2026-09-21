// Thin client for the TriloPlan User API (see TriloPlan-User.postman_collection.json).
// Handles base URL, auth headers, and one silent access-token refresh on a 401.

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

const SESSION_KEY = 'vibe_session_v1'

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { accessToken: null, refreshToken: null, userId: null }
}

let session = loadSession()
const listeners = new Set()

function saveSession(next) {
  session = next
  try {
    if (next.accessToken) localStorage.setItem(SESSION_KEY, JSON.stringify(next))
    else localStorage.removeItem(SESSION_KEY)
  } catch {}
  listeners.forEach((l) => l(session))
}

export function getSession() {
  return session
}
export function isAuthenticated() {
  return !!session.accessToken
}
export function onSessionChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function setSession({ accessToken, refreshToken, userId }) {
  saveSession({ accessToken, refreshToken: refreshToken ?? session.refreshToken, userId: userId ?? session.userId })
}
export function clearSession() {
  saveSession({ accessToken: null, refreshToken: null, userId: null })
}

// Keep the in-memory session in sync across tabs — e.g. logging out (or a token
// refresh) in one tab should be reflected in every other open tab, not just on
// its next failed request. `storage` only fires in tabs OTHER than the one that
// wrote localStorage, so this never loops back on itself.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== SESSION_KEY) return
    session = e.newValue ? JSON.parse(e.newValue) : { accessToken: null, refreshToken: null, userId: null }
    listeners.forEach((l) => l(session))
  })
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

let refreshPromise = null

async function refreshAccessToken() {
  if (!session.refreshToken) throw new ApiError('No refresh token', 401)
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/user/auth/token/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) throw new ApiError('Session expired', res.status)
        const data = await res.json()
        saveSession({ accessToken: data.accessToken, refreshToken: data.refreshToken || session.refreshToken, userId: session.userId })
        return data
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

// The backend now namespaces every endpoint by app (API-design follow-up) —
// this app only ever calls the User surface, so every path gets /user
// prepended here in one place rather than at each call site.
async function request(path, { method = 'GET', body, auth = true, retry = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    if (!session.accessToken) throw new ApiError('Not authenticated', 401)
    headers.Authorization = `Bearer ${session.accessToken}`
  }
  let res
  try {
    res = await fetch(`${API_BASE_URL}/user${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    throw new ApiError('Network error — check your connection', 0)
  }

  if (res.status === 401 && auth && retry && session.refreshToken) {
    try {
      await refreshAccessToken()
      return request(path, { method, body, auth, retry: false })
    } catch {
      clearSession()
      throw new ApiError('Session expired', 401)
    }
  }

  const text = await res.text()
  let data = null
  if (text) {
    try { data = JSON.parse(text) } catch { data = null }
  }
  if (!res.ok) {
    // Not every error path returns JSON (rate limiting, proxy errors, etc. can
    // come back as plain text) — fall back to the raw body so the real reason
    // still reaches the UI instead of a generic message.
    throw new ApiError(data?.message || data?.error || (typeof text === 'string' && text.trim()) || res.statusText || 'Request failed', res.status, data)
  }
  return data
}

export async function uploadToS3(uploadUrl, content, contentType) {
  const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: content })
  if (!res.ok) throw new ApiError('Upload failed', res.status)
  return true
}

/* ---------------- Auth ---------------- */
export const authApi = {
  requestOtp: (phone) => request('/auth/otp/request', { method: 'POST', body: { phone }, auth: false }),
  verifyOtp: (phone, code, role = 'user') => request('/auth/otp/verify', { method: 'POST', body: { phone, code, role }, auth: false }),
  refresh: () => refreshAccessToken(),
  logout: () => request('/auth/logout', { method: 'POST', body: { refreshToken: session.refreshToken } }),
}

/* ---------------- Profile (Me) ---------------- */
export const meApi = {
  get: () => request('/me'),
  update: (patch) => request('/me', { method: 'PATCH', body: patch }),
  verifyAge: () => request('/me/verify-age', { method: 'POST' }),
  kycUploadUrl: (contentType) => request('/me/kyc/upload-url', { method: 'POST', body: { contentType } }),
  submitKyc: (documents) => request('/me/kyc', { method: 'POST', body: { documents } }),
  getKyc: () => request('/me/kyc'),
  notificationPrefs: () => request('/me/notification-preferences'),
  updateNotificationPrefs: (patch) => request('/me/notification-preferences', { method: 'PATCH', body: patch }),
  following: () => request('/me/following'),
  subscriptions: () => request('/me/subscriptions'),
  calls: (page = 1, pageSize = 20) => request(`/me/calls?page=${page}&pageSize=${pageSize}`),
  deleteAccount: () => request('/me/delete-account', { method: 'POST', body: { confirm: 'DELETE' } }),
}

/* ---------------- Hosts ---------------- */
export const hostsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')),
    ).toString()
    return request(`/hosts${qs ? `?${qs}` : ''}`)
  },
  get: (id) => request(`/hosts/${id}`),
  follow: (id) => request(`/hosts/${id}/follow`, { method: 'POST' }),
  unfollow: (id) => request(`/hosts/${id}/unfollow`, { method: 'POST' }),
}

/* ---------------- Wallet & Recharge ---------------- */
export const walletApi = {
  get: () => request('/wallet'),
  devCredit: (amountPaise) => request('/wallet/dev-credit', { method: 'POST', body: { amountPaise } }),
  packages: () => request('/wallet/recharge-packages'),
  initiateRecharge: (packageId) => request('/wallet/recharge/initiate', { method: 'POST', body: { packageId } }),
  rechargeStatus: (txnId) => request(`/wallet/recharge/${txnId}`),
  devResolveRecharge: (txnId, outcome) => request(`/wallet/recharge/${txnId}/dev-resolve`, { method: 'POST', body: { outcome } }),
}

/* ---------------- VIP Subscription ---------------- */
export const vipApi = {
  plans: () => request('/vip/plans'),
  subscribe: (planId) => request('/vip/subscribe', { method: 'POST', body: { planId } }),
  cancel: (subscriptionId) => request(`/me/subscriptions/${subscriptionId}/cancel`, { method: 'POST' }),
}

/* ---------------- Calls ---------------- */
export const callsApi = {
  initiate: (hostId, type) => request('/calls', { method: 'POST', body: { hostId, type } }),
  get: (id) => request(`/calls/${id}`),
  end: (id) => request(`/calls/${id}/end`, { method: 'POST' }),
  rate: (id, stars) => request(`/calls/${id}/rating`, { method: 'POST', body: { stars } }),
}

/* ---------------- Chat ---------------- */
export const chatApi = {
  send: (recipientId, content) => request('/chat/messages', { method: 'POST', body: { recipientId, content } }),
  conversations: () => request('/chat/conversations'),
  messages: (conversationId, page = 1, pageSize = 50) =>
    request(`/chat/conversations/${conversationId}/messages?page=${page}&pageSize=${pageSize}`),
}

/* ---------------- Gifts ---------------- */
export const giftsApi = {
  catalog: () => request('/gifts'),
  send: (recipientId, giftId, context, contextId) =>
    request('/gifts/send', { method: 'POST', body: { recipientId, giftId, context, contextId } }),
  declineRequest: (hostId) => request('/gifts/request/decline', { method: 'POST', body: { hostId } }),
}

/* ---------------- Live Broadcasting ---------------- */
export const liveApi = {
  list: () => request('/live/broadcasts'),
  join: (id) => request(`/live/broadcasts/${id}/join`, { method: 'POST' }),
  chat: (id, content) => request(`/live/broadcasts/${id}/chat`, { method: 'POST', body: { content } }),
  leave: (id) => request(`/live/broadcasts/${id}/leave`, { method: 'POST' }),
}

/* ---------------- Moderation ---------------- */
export const moderationApi = {
  block: (userId) => request('/moderation/blocks', { method: 'POST', body: { userId } }),
  listBlocked: () => request('/moderation/blocks'),
  unblock: (userId) => request(`/moderation/blocks/${userId}`, { method: 'DELETE' }),
  report: (targetType, targetId, reason) => request('/moderation/reports', { method: 'POST', body: { targetType, targetId, reason } }),
  captureEvent: (context, contextId) => request('/moderation/capture-event', { method: 'POST', body: { context, contextId } }),
}

/* ---------------- Grievance ---------------- */
export const grievanceApi = {
  uploadUrl: (contentType) => request('/grievances/upload-url', { method: 'POST', body: { contentType } }),
  submit: (payload) => request('/grievances', { method: 'POST', body: payload }),
}
