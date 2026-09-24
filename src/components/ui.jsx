import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { gradientFor } from '../store/seed'

/* ---------------- Avatar ---------------- */
// `photoUrl`, when given, renders the real uploaded photo instead of the
// generated color-gradient placeholder. Falls back to the gradient if the
// photo fails to load (a broken/expired URL, or a storage permission issue —
// e.g. an upload succeeding but the file coming back non-public — should
// never show a broken-image icon, only the same placeholder as no photo at all).
export function Avatar({ id = 'me', size = 40, ring, ringColor = '#e79b9b', live, photoUrl, className = '' }) {
  const [a, b] = gradientFor(id)
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [photoUrl])
  const showPhoto = photoUrl && !failed

  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      {showPhoto ? (
        <img
          src={photoUrl}
          alt=""
          onError={() => setFailed(true)}
          className="block h-full w-full rounded-full object-cover"
          style={{ boxShadow: ring ? `0 0 0 2px ${ringColor}, 0 0 0 4px #fff` : 'none' }}
        />
      ) : (
        <span
          className="block h-full w-full rounded-full"
          style={{
            background: `radial-gradient(circle at 32% 30%, ${a}, ${b})`,
            boxShadow: ring ? `0 0 0 2px ${ringColor}, 0 0 0 4px #fff` : 'none',
          }}
        />
      )}
      {live && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-rose-600 px-1 py-[1px] text-[8px] font-bold uppercase tracking-wide text-white">
          Live
        </span>
      )}
    </span>
  )
}

/* ---------------- Gradient media ---------------- */
export function GradientBox({ from = '#8f7fe0', to = '#5b28d6', seed = 0, className = '', children, style }) {
  const rot = 120 + (seed % 5) * 25
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: `linear-gradient(${rot}deg, ${from}, ${to})`, ...style }}
    >
      <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15" />
      <div className="pointer-events-none absolute -bottom-16 left-1/2 h-40 w-[130%] -translate-x-1/2 rounded-[50%] bg-white/10" />
      {children}
    </div>
  )
}

/* ---------------- Button ---------------- */
export function Button({ variant = 'primary', size = 'md', className = '', as: As = 'button', ...rest }) {
  const variants = {
    primary: 'bg-brand text-white hover:bg-brand-600',
    gold: 'bg-gold text-ink hover:brightness-105',
    outline: 'border border-line bg-white text-ink hover:bg-gray-50 dark:bg-transparent dark:hover:bg-white/5',
    ghost: 'text-brand hover:bg-brand-50 dark:hover:bg-white/5',
    danger: 'border border-rose-300 text-rose-600 bg-white hover:bg-rose-50 dark:bg-transparent',
    dark: 'bg-ink text-white hover:brightness-110',
  }
  const sizes = { sm: 'px-3 py-1.5 text-[13px]', md: 'px-5 py-2.5 text-[14px]', lg: 'px-6 py-3.5 text-[15px]' }
  return (
    <As
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    />
  )
}

/* ---------------- Card ---------------- */
export function Card({ className = '', children, ...rest }) {
  return (
    <div className={`rounded-2xl border border-line bg-card shadow-card ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function PageHeader({ title, subtitle, right, className = '' }) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-3 ${className}`}>
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-subtle">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

/* ---------------- Chip / Segmented / Toggle ---------------- */
export function Chip({ active, className = '', ...rest }) {
  return (
    <button
      className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
        active ? 'bg-brand text-white' : 'bg-gray-100 text-ink hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15'
      } ${className}`}
      {...rest}
    />
  )
}

export function Segmented({ options, value, onChange, className = '' }) {
  return (
    <div className={`inline-flex rounded-xl bg-gray-100 p-1 dark:bg-white/10 ${className}`}>
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value
        const label = typeof o === 'string' ? o : o.label
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`rounded-lg px-4 py-1.5 text-[13px] font-semibold transition ${
              value === v ? 'bg-card text-brand shadow-sm' : 'text-subtle hover:text-ink'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition ${checked ? 'bg-brand' : 'bg-gray-300 dark:bg-white/20'}`}
    >
      <span className={`h-6 w-6 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

/* ---------------- Modal & Drawer ---------------- */
export function Modal({ open, onClose, title, children, className = '' }) {
  useEffect(() => {
    if (!open) return
    const h = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    // z-[110]: must beat CallRoom/LiveRoom's own z-[70] full-screen overlay —
    // a portal to document.body doesn't escape z-index comparison, so at z-50
    // this modal was rendering *behind* the call screen's own UI whenever it
    // was opened from inside a call (e.g. GiftPicker), making its buttons
    // unclickable even though the modal was visually drawn on top.
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-line bg-card p-5 shadow-2xl ${className}`}>
        {title && (
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <h3 className="text-[17px] font-bold text-ink">{title}</h3>
            <button onClick={onClose} className="rounded-lg p-1 text-subtle hover:bg-gray-100 dark:hover:bg-white/10">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/* ---------------- Empty state ---------------- */
export function EmptyState({ icon, tone = 'brand', title, text, children }) {
  const tones = {
    brand: 'bg-brand-50 text-brand border-brand-200 dark:bg-brand/15',
    green: 'bg-green-50 text-green-600 border-green-300 dark:bg-green-500/15',
    gold: 'bg-gold-soft text-gold border-gold dark:bg-gold/15',
    rose: 'bg-rose-50 text-rose-500 border-rose-200 dark:bg-rose-500/15',
    slate: 'bg-gray-100 text-gray-500 border-gray-300 dark:bg-white/10',
  }
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className={`mb-4 flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed ${tones[tone]}`}>
        {icon}
      </div>
      <h3 className="text-[18px] font-bold text-ink">{title}</h3>
      {text && <p className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-subtle">{text}</p>}
      {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{children}</div>}
    </div>
  )
}

/* ---------------- Stat tile ---------------- */
export function Stat({ label, value, accent = 'ink', sub }) {
  const c = { ink: 'text-ink', gold: 'text-gold', green: 'text-green-600', rose: 'text-rose-500' }[accent]
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <p className="text-[12px] font-medium text-subtle">{label}</p>
      <p className={`mt-0.5 text-[20px] font-extrabold ${c}`}>{value}</p>
      {sub && <p className="text-[11px] text-subtle">{sub}</p>}
    </div>
  )
}

/* ---------------- Skeleton ---------------- */
export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200 dark:bg-white/10 ${className}`} />
}

/* ---------------- Toast host ---------------- */
export function ToastHost({ toasts }) {
  return createPortal(
    // z-[120]: same reasoning as Modal above — must clear CallRoom/LiveRoom's
    // z-[70], otherwise a toast fired from inside a call (e.g. "Sent Rose")
    // renders invisibly behind the call screen.
    <div className="fixed bottom-5 left-1/2 z-[120] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-none rounded-full px-4 py-2 text-[13px] font-medium text-white shadow-lg ${
            t.tone === 'error' ? 'bg-rose-600' : 'bg-ink'
          }`}
        >
          {t.msg}
        </div>
      ))}
    </div>,
    document.body,
  )
}
