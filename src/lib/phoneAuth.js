/* Phone login through Firebase Phone Auth — Firebase sends the OTP SMS, and the backend only
 * ever sees the Firebase ID token it gets back (POST /auth/firebase/verify), never the code.
 *
 * Configured with the TriloPlan Firebase project's web app config (Project settings → General →
 * Your apps → Web app) in VITE_FIREBASE_API_KEY / _AUTH_DOMAIN / _PROJECT_ID / _APP_ID. Until all
 * four are set, `firebasePhoneAuthEnabled` is false and login keeps using the old backend OTP. */
import { initializeApp } from 'firebase/app'
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, signOut, initializeRecaptchaConfig } from 'firebase/auth'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebasePhoneAuthEnabled = Object.values(config).every(Boolean)

const RECAPTCHA_ID = 'recaptcha-container'
let auth = null
let verifier = null
let confirmation = null

function firebaseAuth() {
  if (!auth) {
    auth = getAuth(initializeApp(config))
    auth.useDeviceLanguage()
    // When phone sign-in uses reCAPTCHA Enterprise (Firebase → Authentication → Settings →
    // reCAPTCHA), the check is score-based and invisible — no picture puzzles. Loading that config
    // up front makes the first send use it; with Enterprise off this is a no-op and the v2
    // verifier below is used as before.
    initializeRecaptchaConfig(auth).catch(() => {})
  }
  return auth
}

// Start Firebase (and fetch its reCAPTCHA config) as the app opens, not on the first tap.
if (firebasePhoneAuthEnabled && typeof window !== 'undefined') firebaseAuth()

/** A brand-new invisible reCAPTCHA in a brand-new <div> for every send (and resend). Reusing a
 * node that once held a widget — after a failed send, a resend, or a dev hot-reload — throws
 * "reCAPTCHA has already been rendered in this element", so the old node is removed, not emptied.
 * It lives on <body>, not in a page, so route changes (phone screen → code screen) don't touch it. */
function freshVerifier() {
  resetVerifier()
  const el = document.createElement('div')
  el.id = RECAPTCHA_ID
  document.body.appendChild(el)
  verifier = new RecaptchaVerifier(firebaseAuth(), el, { size: 'invisible' })
  return verifier
}

function resetVerifier() {
  try { verifier?.clear() } catch { /* already gone */ }
  verifier = null
  document.querySelectorAll(`#${RECAPTCHA_ID}`).forEach((el) => el.remove())
}

const MESSAGES = {
  'auth/invalid-phone-number': 'That phone number looks wrong. Check it and try again.',
  'auth/missing-phone-number': 'Enter your phone number.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/quota-exceeded': 'We can’t send more codes right now. Try again in a little while.',
  'auth/captcha-check-failed': 'Security check failed. Reload the page and try again.',
  'auth/invalid-app-credential': 'Security check failed. Reload the page and try again.',
  'auth/unauthorized-domain': 'Login isn’t enabled for this website yet (Firebase authorized domains).',
  'auth/operation-not-allowed': 'Phone login isn’t allowed yet — check Firebase → Authentication: Phone sign-in enabled, and SMS region policy allows India.',
  'auth/billing-not-enabled': 'Phone login needs the Firebase Blaze plan to send SMS.',
  'auth/invalid-verification-code': 'That code is wrong. Check the SMS and try again.',
  'auth/missing-verification-code': 'Enter the 6-digit code.',
  'auth/code-expired': 'That code has expired. Tap “Resend code” for a new one.',
  'auth/session-expired': 'That code has expired. Tap “Resend code” for a new one.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
}

/** A readable message for a Firebase error (or anything else thrown along the way). */
export function phoneAuthError(e, fallback = 'Something went wrong. Try again.') {
  // operation-not-allowed covers two different setup problems; Firebase's own text says which.
  if (e?.code === 'auth/operation-not-allowed' && /region/i.test(e?.message || '')) {
    return 'SMS to this country isn’t allowed yet (Firebase → Authentication → Settings → SMS region policy).'
  }
  // The Firebase code goes on the end (e.g. "(auth/invalid-app-credential)") so a screenshot of
  // the error is enough to tell which setup problem it is.
  const base = MESSAGES[e?.code] || e?.message || fallback
  return e?.code && MESSAGES[e.code] ? `${base} (${e.code})` : base
}

/** Sends the OTP SMS to an E.164 number like +919876543210. Call again to resend. */
export async function sendPhoneCode(phone) {
  try {
    confirmation = await signInWithPhoneNumber(firebaseAuth(), phone, freshVerifier())
  } catch (e) {
    console.error('[phoneAuth] send failed', e?.code, e?.message, e?.customData)
    throw Object.assign(new Error(phoneAuthError(e, 'Could not send the code. Try again.')), { code: e?.code })
  } finally {
    // A reCAPTCHA is single-use either way; the code check (confirm) doesn't need it.
    resetVerifier()
  }
}

/** Checks the 6-digit code and returns the Firebase ID token to hand to the backend. */
export async function confirmPhoneCode(code) {
  if (!confirmation) throw new Error('That code has expired. Tap “Resend code” for a new one.')
  try {
    const cred = await confirmation.confirm(code)
    const idToken = await cred.user.getIdToken()
    confirmation = null
    // Our own backend session takes over from here; don't keep a second (Firebase) session around.
    signOut(firebaseAuth()).catch(() => {})
    return idToken
  } catch (e) {
    throw Object.assign(new Error(phoneAuthError(e, 'Invalid code. Try again.')), { code: e?.code })
  }
}
