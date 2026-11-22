import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Button } from './ui'

const REDIRECT_SECONDS = 4

// Shown once the backend has confirmed a payment with Cashfree (never on the client's word):
// a big tick, what was bought, and an automatic move on to `to` after a few seconds — with a
// "Continue now" button for anyone who doesn't want to wait.
export default function PaymentSuccess({ title, subtitle, children, to, label }) {
  const nav = useNavigate()
  const [left, setLeft] = useState(REDIRECT_SECONDS)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setStarted(true)) // lets the progress bar animate from 0
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    if (left <= 0) { nav(to, { replace: true }); return }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [left, nav, to])

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-12 text-center animate-fadeIn" role="status" aria-live="polite">
      <span className="relative grid h-28 w-28 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-green-500/20 [animation-iteration-count:2]" />
        <span className="absolute inset-2 rounded-full bg-green-500/15" />
        <span className="relative grid h-16 w-16 place-items-center rounded-full bg-green-600 text-white shadow-lg animate-splashPop">
          <Check size={30} strokeWidth={3} />
        </span>
      </span>
      <h1 className="mt-4 text-[21px] font-bold text-ink">{title}</h1>
      {subtitle && <p className="mt-1.5 text-[13px] leading-relaxed text-subtle">{subtitle}</p>}
      {children}
      <div className="mt-6 w-full">
        <div className="h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-green-600 ease-linear"
            style={{ width: started ? '100%' : '0%', transition: `width ${REDIRECT_SECONDS}s linear` }}
          />
        </div>
        <p className="mt-2 text-[12px] text-subtle">Taking you to {label} in {Math.max(left, 0)}s…</p>
      </div>
      <Button className="mt-4 w-full py-3" onClick={() => nav(to, { replace: true })}>Continue now</Button>
    </div>
  )
}
