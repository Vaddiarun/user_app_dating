import { moderationApi } from './api'

// Thin abstraction over the app's security-event reporting: POST
// /moderation/capture-event (also used by CaptureGuard.jsx for a detected
// PrintScreen). Each app event maps to one of the backend's event types.
// Only SCREENSHOT_ATTEMPT and SCREEN_RECORDING_SUSPECTED are capture evidence
// and count toward an account review; PAGE_HIDDEN is a softer signal the
// backend only logs for the admin Security Events screen, so reporting it
// can never push an account toward a restriction on its own.
const BACKEND_TYPE = {
  SCREEN_CAPTURE_DETECTED: 'SCREENSHOT_ATTEMPT',
  SCREEN_SHARE_STARTED: 'SCREEN_RECORDING_SUSPECTED',
  PAGE_HIDDEN: 'PAGE_HIDDEN',
}

// The endpoint only accepts these contexts (see CaptureGuard.jsx).
const CONTEXTS = new Set(['call', 'chat', 'live'])

export function logSecurityEvent(type, { context, contextId } = {}) {
  if (import.meta.env.DEV) console.info('[security]', type, context ?? '', contextId ?? '')
  const backendType = BACKEND_TYPE[type]
  if (!backendType || !CONTEXTS.has(context)) return
  moderationApi.captureEvent(context, contextId, backendType).catch(() => {})
}

// Feature-detection only — see the long comment on SCREEN_SHARE_STARTED usage
// in CallRoom.jsx for exactly what this can and cannot tell you.
export function isDisplayCaptureApiSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
}
