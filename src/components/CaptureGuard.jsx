import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { moderationApi } from '../lib/api'
import { useApp } from '../store/AppStore'
import { registerStrike, markRestricted, STRIKE_LIMIT } from '../lib/captureStrikes'

// A web page can't actually prevent a screenshot or screen recording the way a
// native app's DRM layer can (Netflix/Prime rely on OS-level protections no
// browser API gives us). The one signal a browser tab reliably still sees is
// the Windows PrintScreen key — Meta+Shift+3/4/5 on macOS and mobile capture
// gestures never reach page JS at all. So this is a best-effort, app-wide
// deterrent: flag the moment we *can* detect it, log it for moderation via the
// real API, warn with escalating severity, and lock the account out on this
// device after repeated attempts (see lib/captureStrikes.js for what that
// enforcement actually is and isn't). Mounted once at the app root.
// The backend's capture-event endpoint validates `context` against a strict
// enum — call | chat | live, nothing else — so anything outside those three
// screens has no valid value to send at all (not even a generic "app"; that
// used to be sent here and the backend rejected every single one of those
// requests with a 400, silently, since the request is fire-and-forget).
function contextFromPath(pathname) {
  const call = pathname.match(/^\/(call|live)\/([^/]+)/)
  if (call) return { context: call[1], contextId: call[2] }
  if (/^\/chat(\/|$)/.test(pathname)) return { context: 'chat', contextId: pathname.split('/')[2] }
  return null
}

export default function CaptureGuard() {
  const location = useLocation()
  const nav = useNavigate()
  const { state, actions } = useApp()
  const [strike, setStrike] = useState(0)
  const userId = state.user?.id

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'PrintScreen') return
      const ctx = contextFromPath(location.pathname)
      if (ctx) moderationApi.captureEvent(ctx.context, ctx.contextId).catch(() => {})

      const count = registerStrike(userId)
      if (count >= STRIKE_LIMIT) {
        const record = markRestricted(userId)
        actions.logout().finally(() => nav('/account-restricted', { state: { caseRef: record?.caseRef } }))
        return
      }
      setStrike(count)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [location.pathname, userId]) // eslint-disable-line

  useEffect(() => {
    if (!strike) return
    const t = setTimeout(() => setStrike(0), 3500)
    return () => clearTimeout(t)
  }, [strike])

  if (!strike) return null
  const final = strike >= STRIKE_LIMIT - 1
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-black px-6 text-center text-white">
      <div>
        <ShieldAlert size={40} className={`mx-auto ${final ? 'text-rose-500' : 'text-rose-400'}`} />
        <p className="mt-4 text-[17px] font-bold">{final ? 'Final warning' : "Screenshots aren't allowed here"}</p>
        <p className="mt-2 max-w-xs text-[13px] text-white/70">
          {final
            ? 'This content is protected. One more attempt will suspend this account.'
            : 'This content is protected. Your attempt has been reported for a safety review.'}
        </p>
      </div>
    </div>
  )
}
