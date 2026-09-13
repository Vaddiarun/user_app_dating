import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Sparkles, ChevronLeft, ChevronRight, Camera, ShieldCheck, Loader2, Clock } from 'lucide-react'
import { Button } from '../components/ui'
import { Avatar } from '../components/ui'
import { useApp } from '../store/AppStore'
import { authApi, meApi, ApiError } from '../lib/api'

const STEP_LABELS = ['Phone', 'Verify', 'Profile', 'Access']

function Page({ children }) {
  return (
    <div className="min-h-screen bg-card">
      <div className="mx-auto w-full max-w-md px-5 pb-10 pt-8">{children}</div>
    </div>
  )
}

function StepHeader({ n, title, onBack }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line text-ink hover:bg-gray-50 dark:hover:bg-white/5"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <div>
          <h1 className="text-[19px] font-bold text-ink">{title}</h1>
          <p className="text-[13px] text-subtle">Step {n} of 4</p>
        </div>
      </div>

      <div className="mt-4 border-t border-line" />

      <div className="mt-5 flex items-start gap-1">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                  i + 1 <= n ? 'bg-brand text-white' : 'bg-gray-100 text-subtle dark:bg-white/10'
                }`}
              >
                {i + 1 < n ? '✓' : i + 1}
              </span>
              {i < 3 && <span className={`h-0.5 flex-1 ${i + 2 <= n ? 'bg-brand' : 'bg-gray-200 dark:bg-white/10'}`} />}
            </div>
            <span className={`text-center text-[11px] font-medium ${i + 1 <= n ? 'text-ink' : 'text-subtle'}`}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ErrorText({ error }) {
  if (!error) return null
  return <p className="mt-2 text-[13px] font-medium text-rose-500">{error}</p>
}

export function Splash() {
  const nav = useNavigate()
  return (
    <div className="relative grid min-h-screen place-items-end bg-gradient-to-b from-[#3a2568] via-[#1a1236] to-[#0b0814] p-6">
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="text-center text-white">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand"><Sparkles size={28} /></span>
          <h1 className="mt-4 text-[28px] font-extrabold tracking-tight">Vibe</h1>
          <p className="mt-1 text-[14px] text-white/60">Real conversations with creators</p>
        </div>
      </div>
      <div className="w-full max-w-md">
        <Button className="w-full py-4" onClick={() => nav('/onboarding/phone')}>Get started</Button>
      </div>
    </div>
  )
}

export function Phone() {
  const nav = useNavigate()
  const [digits, setDigits] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    const clean = digits.replace(/\D/g, '')
    if (clean.length !== 10) { setError('Enter a valid 10-digit mobile number'); return }
    const phone = `+91${clean}`
    setBusy(true)
    setError('')
    try {
      const res = await authApi.requestOtp(phone)
      nav('/onboarding/otp', { state: { phone, devCode: res?.devCode || '' } })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send code. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <StepHeader n={1} title="Your number" onBack={() => nav('/onboarding')} />

      <label className="mt-6 block text-[13px] font-semibold text-ink">Mobile number</label>
      <div className="mt-2 flex items-center gap-2 rounded-xl border-2 border-brand bg-canvas px-4 py-3">
        <span className="text-[16px] font-semibold text-subtle">+91</span>
        <input
          autoFocus
          value={digits}
          onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="98765 43210"
          inputMode="numeric"
          className="flex-1 bg-transparent text-[16px] outline-none"
        />
      </div>
      <ErrorText error={error} />
      <p className="mt-3 text-[13px] leading-relaxed text-subtle">We'll send a 6-digit code to confirm it's you. Standard rates may apply.</p>
      <Button className="mt-5 w-full py-3" onClick={submit} disabled={busy}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : null} Send code
      </Button>
    </Page>
  )
}

export function Otp() {
  const nav = useNavigate()
  const location = useLocation()
  const { actions } = useApp()
  const phone = location.state?.phone
  const [d, setD] = useState(Array.from(location.state?.devCode || '', (c) => c).concat(Array(6).fill('')).slice(0, 6))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resendIn, setResendIn] = useState(30)
  const [resending, setResending] = useState(false)
  const inputRefs = useRef([])

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [resendIn])

  if (!phone) {
    nav('/onboarding/phone', { replace: true })
    return null
  }

  const code = d.join('')
  const mmss = `0:${String(resendIn).padStart(2, '0')}`

  const setDigitAt = (i, val) => {
    const clean = val.replace(/\D/g, '').slice(-1)
    setD((arr) => arr.map((x, j) => (j === i ? clean : x)))
    if (clean && i < 5) inputRefs.current[i + 1]?.focus()
  }

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !d[i] && i > 0) inputRefs.current[i - 1]?.focus()
  }

  const verify = async () => {
    if (code.length !== 6) { setError('Enter the 6-digit code'); return }
    setBusy(true)
    setError('')
    try {
      const res = await authApi.verifyOtp(phone, code, 'user')
      await actions.login({ accessToken: res.accessToken, refreshToken: res.refreshToken, userId: res.user?.id })
      nav('/onboarding/profile')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid code. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    if (resendIn > 0 || resending) return
    setResending(true)
    setError('')
    try {
      await authApi.requestOtp(phone)
      setResendIn(30)
      setD(Array(6).fill(''))
      inputRefs.current[0]?.focus()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend code.')
    } finally {
      setResending(false)
    }
  }

  return (
    <Page>
      <StepHeader n={2} title="Verify" onBack={() => nav('/onboarding/phone')} />

      <p className="mt-6 text-[14px] text-subtle">Code sent to <span className="font-semibold text-ink">{phone}</span></p>
      <div className="mt-4 flex gap-2.5">
        {d.map((v, i) => (
          <input
            key={i}
            ref={(el) => (inputRefs.current[i] = el)}
            value={v}
            maxLength={1}
            inputMode="numeric"
            onChange={(e) => setDigitAt(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            className={`h-14 min-w-0 flex-1 rounded-xl border text-center text-[22px] font-bold text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-200 ${v ? 'border-brand' : 'border-line'}`}
          />
        ))}
      </div>
      <ErrorText error={error} />

      <button onClick={resend} disabled={resendIn > 0 || resending} className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-subtle disabled:cursor-default">
        {resending ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
        {resendIn > 0 ? `Resend code in ${mmss}` : <span className="font-semibold text-brand">Resend code</span>}
      </button>

      <Button className="mt-5 w-full py-3" onClick={verify} disabled={busy}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : null} Verify
      </Button>
    </Page>
  )
}

export function ProfileSetup() {
  const nav = useNavigate()
  const { state, actions } = useApp()
  const [name, setName] = useState(state.user?.name || '')
  const [dob, setDob] = useState(state.user?.dob || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!name.trim()) { setError('Enter a display name'); return }
    if (!dob) { setError('Enter your date of birth'); return }
    setBusy(true)
    setError('')
    try {
      await meApi.update({ name: name.trim(), dob })
      await actions.refreshUser()
      nav('/onboarding/access')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <StepHeader n={3} title="Set up profile" onBack={() => nav(-1)} />

      <div className="mt-6 flex flex-col items-center">
        <div className="relative">
          <Avatar id={state.user?.id || 'me'} size={84} />
          <span className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full border-2 border-card bg-brand text-white"><Camera size={13} /></span>
        </div>
        <p className="mt-2 text-[13px] text-subtle">Add a profile photo</p>
      </div>
      <label className="mt-5 block text-[13px] font-semibold text-ink">Display name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-[15px] outline-none" />
      <label className="mt-4 block text-[13px] font-semibold text-ink">Date of birth</label>
      <input
        type="date"
        value={dob}
        onChange={(e) => setDob(e.target.value)}
        className="mt-2 flex w-full items-center justify-between rounded-xl border border-line bg-canvas px-4 py-3 text-[15px] outline-none"
      />
      <p className="mt-3 text-[12px] leading-relaxed text-subtle">Date of birth is used to confirm eligibility. It is never shown on your public profile.</p>
      <ErrorText error={error} />
      <Button className="mt-5 w-full py-3" onClick={submit} disabled={busy}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : null} Continue <ChevronRight size={16} />
      </Button>
    </Page>
  )
}

export function AccessConfirmed() {
  const nav = useNavigate()
  const { actions } = useApp()
  const [busy, setBusy] = useState(true)
  const [verified, setVerified] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    meApi.verifyAge()
      .then((res) => { setVerified(!!res.ageVerified); actions.patchUserLocal({ ageVerified: !!res.ageVerified }) })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not verify age.'))
      .finally(() => setBusy(false))
  }, []) // eslint-disable-line

  return (
    <Page>
      <StepHeader n={4} title="Access" />

      <div className="flex flex-col items-center py-4 text-center">
        <span className="grid h-24 w-24 place-items-center rounded-[28px] text-brand" style={{ background: 'linear-gradient(150deg,#f3e9ff,#ffe9e0)' }}>
          {busy ? <Loader2 size={32} className="animate-spin" /> : <ShieldCheck size={44} />}
        </span>
        <h1 className="mt-5 text-[21px] font-bold text-ink">{busy ? 'Checking eligibility…' : verified ? 'Access confirmed' : 'Access limited'}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-subtle">
          {busy
            ? 'One moment while we confirm your date of birth.'
            : verified
              ? 'Your date of birth meets the eligibility requirement for this platform. No further action is needed.'
              : error || 'Your date of birth does not meet the eligibility requirement yet. You can still use most of the app.'}
        </p>
        {!busy && verified && (
          <p className="mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-green-600">
            <span className="h-2 w-2 rounded-full bg-green-500" /> Verified from date of birth
          </p>
        )}
      </div>
      <Button className="w-full py-3.5" disabled={busy} onClick={() => nav('/')}>Continue to Vibe</Button>
    </Page>
  )
}
