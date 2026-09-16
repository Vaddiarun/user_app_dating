import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { moderationApi } from '../lib/api'

// A web page can't actually prevent a screenshot or screen recording the way a
// native app's DRM layer can (Netflix/Prime rely on OS-level protections no
// browser API gives us). The one signal a browser tab reliably still sees is
// the Windows PrintScreen key — Meta+Shift+3/4/5 on macOS and mobile capture
// gestures never reach page JS at all. So this is a best-effort deterrent: flag
// the moment we *can* detect, log it for moderation via the real API, and show
// the same kind of warning those apps do — not a technical block.
export default function CaptureGuard({ context, contextId }) {
  const [warn, setWarn] = useState(false)

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'PrintScreen') return
      setWarn(true)
      if (contextId) moderationApi.captureEvent(context, contextId).catch(() => {})
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [context, contextId])

  useEffect(() => {
    if (!warn) return
    const t = setTimeout(() => setWarn(false), 3500)
    return () => clearTimeout(t)
  }, [warn])

  if (!warn) return null
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black px-6 text-center text-white">
      <div>
        <ShieldAlert size={40} className="mx-auto text-rose-400" />
        <p className="mt-4 text-[17px] font-bold">Screenshots aren't allowed here</p>
        <p className="mt-2 max-w-xs text-[13px] text-white/70">
          This content is protected. Your attempt has been reported for a safety review.
        </p>
      </div>
    </div>
  )
}
