export const nf = new Intl.NumberFormat('en-IN')

export function beans(n) {
  return nf.format(Math.round(n))
}

export function clock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export function relTime(ts) {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yest'
  if (d < 7) return `${d}d`
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function timeOfDay(ts) {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}

export function rupees(paise) {
  return nf.format(Math.round((paise || 0) / 100))
}

export function compact(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

export function userName(user) {
  if (!user) return 'User'
  if (typeof user === 'string') return user.trim() || 'User'
  const name = user.name?.trim()
  if (name) return name
  const username = user.username?.trim()
  if (username) return username
  if (user.phone) {
    const digits = String(user.phone).replace(/\D/g, '')
    return digits ? `User ${digits.slice(-4)}` : 'User'
  }
  return 'User'
}

// A short, non-reversible-looking fragment of a UUID for burning into a
// watermark — the full id is unnecessary for tracing a leak back to an
// account and is needlessly long for an on-video overlay.
export function shortRef(id) {
  if (!id) return '——'
  return String(id).replace(/-/g, '').slice(-6).toUpperCase()
}

export function userHandle(user) {
  if (!user) return ''
  if (user.username?.trim()) return `@${user.username.trim()}`
  if (user.phone) return user.phone
  return ''
}

