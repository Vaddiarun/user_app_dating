import { useEffect, useState } from 'react'
import { userName } from '../lib/format'

// Nothing in a browser can stop a screen recording — there's no API for it, and
// live WebRTC video (unlike Netflix's pre-packaged, DRM-licensed streams) has no
// hardware-secured decode path to route through even in principle. So instead of
// pretending to block it, this burns the viewer's identity + a live timestamp
// into the video area, drifting to a new spot every few seconds so a static crop
// can't remove it. It won't stop a leak, but it makes one traceable.
export default function Watermark({ user }) {
  const [pos, setPos] = useState({ top: '18%', left: '12%' })
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const iv = setInterval(
      () => setPos({ top: `${10 + Math.random() * 70}%`, left: `${6 + Math.random() * 60}%` }),
      4000,
    )
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  const label = userName(user)
  const stamp = now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' })

  return (
    <div
      className="pointer-events-none absolute z-[60] select-none whitespace-nowrap text-[11px] font-semibold text-white/20 transition-all duration-[3000ms] ease-in-out"
      style={{ top: pos.top, left: pos.left }}
    >
      {label} · {stamp}
    </div>
  )
}
