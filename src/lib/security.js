import { moderationApi } from './api'

// Thin abstraction over whatever security-event reporting the app already
// has — which is exactly one thing: POST /moderation/capture-event, already
// wired up in CaptureGuard.jsx for a detected PrintScreen. That endpoint only
// accepts a context/contextId pair, not a free-form event type, so only the
// event kinds that genuinely mean "a capture-like thing happened" forward to
// it. Softer signals (a tab losing focus) are real, but they are not capture
// evidence, and reporting them as such into the same moderation pipeline that
// can eventually restrict an account (see lib/captureStrikes.js) would be
// dishonest — so those stay purely local.
const REPORTABLE = new Set(['SCREEN_CAPTURE_DETECTED', 'SCREEN_SHARE_STARTED'])

export function logSecurityEvent(type, { context, contextId } = {}) {
  if (import.meta.env.DEV) console.info('[security]', type, context ?? '', contextId ?? '')
  if (!REPORTABLE.has(type)) return
  moderationApi.captureEvent(context || 'app', contextId).catch(() => {})
}

// Feature-detection only — see the long comment on SCREEN_SHARE_STARTED usage
// in CallRoom.jsx for exactly what this can and cannot tell you.
export function isDisplayCaptureApiSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
}
