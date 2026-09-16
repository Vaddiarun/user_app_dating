// Client-side "3 strikes" enforcement for repeated screenshot attempts, layered
// on top of the real /moderation/capture-event log. This is honest about what
// it is: a per-device, per-account deterrent stored in localStorage, not a true
// cross-device server-side ban — the user API has no self-service "suspend this
// account" endpoint (that's an admin-only capability this app doesn't have
// credentials for). A determined user could clear site data and reset it. What
// it does give: escalating warnings, then a real logout + lockout on this
// device/browser until support reinstates the account.
const STRIKES_KEY = 'vibe_capture_strikes_v1'
const RESTRICTED_KEY = 'vibe_capture_restricted_v1'
export const STRIKE_LIMIT = 3

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} }
}
function writeJSON(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj)) } catch {}
}

export function registerStrike(userId) {
  if (!userId) return 1
  const all = readJSON(STRIKES_KEY)
  all[userId] = (all[userId] || 0) + 1
  writeJSON(STRIKES_KEY, all)
  return all[userId]
}

export function getRestriction(userId) {
  if (!userId) return null
  return readJSON(RESTRICTED_KEY)[userId] || null
}

export function markRestricted(userId) {
  if (!userId) return null
  const all = readJSON(RESTRICTED_KEY)
  const record = { caseRef: `CASE-${userId.replace(/-/g, '').slice(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`, at: Date.now() }
  all[userId] = record
  writeJSON(RESTRICTED_KEY, all)
  return record
}
