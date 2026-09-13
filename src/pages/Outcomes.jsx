import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  AlertTriangle, Plus, MessageSquare, Check, Ban, ShieldAlert, Flag, Loader2, Star,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Avatar, Button, Card } from '../components/ui'
import { beans, clock } from '../lib/format'
import { hostsApi, moderationApi, callsApi, ApiError } from '../lib/api'
import { normalizeHost } from '../lib/normalize'

function useHost(id) {
  const [c, setC] = useState(null)
  useEffect(() => {
    let alive = true
    hostsApi.get(id).then((res) => alive && setC(normalizeHost(res))).catch(() => {})
    return () => { alive = false }
  }, [id])
  return c
}

function Burst({ tone = 'green', children }) {
  const c = tone === 'green' ? '#2fb37a' : tone === 'rose' ? '#e0435f' : '#5b28d6'
  return (
    <span className="relative grid h-24 w-24 place-items-center">
      <span className="absolute inset-0 rounded-full opacity-20" style={{ background: c }} />
      <span className="absolute inset-3 rounded-full opacity-30" style={{ background: c }} />
      <span className="relative grid h-14 w-14 place-items-center rounded-full text-white" style={{ background: c }}>
        {children}
      </span>
    </span>
  )
}

function Centered({ children }) {
  return <div className="mx-auto flex max-w-md flex-col items-center px-4 py-10 text-center">{children}</div>
}

export function CallEnded() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const c = useHost(id)
  return (
    <Centered>
      <span className="grid h-24 w-24 place-items-center rounded-full bg-gray-100 dark:bg-white/10">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-ink text-white"><AlertTriangle size={22} /></span>
      </span>
      <h1 className="mt-4 text-[19px] font-bold text-ink">Your balance ran out</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-subtle">
        The call ended because your balance reached zero. Add balance to continue calling {c?.name || 'this creator'}.
      </p>
      <Card className="mt-5 w-full p-4">
        <Row k="Duration" v={clock(+sp.get('d') || 0)} />
        <Row k="Beans used" v={<span className="text-gold">{beans(+sp.get('b') || 0)}</span>} />
      </Card>
      <Button variant="gold" className="mt-4 w-full py-3" onClick={() => nav('/add-balance')}><Plus size={16} /> Add balance</Button>
      <Button variant="outline" className="mt-3 w-full py-3" onClick={() => nav('/')}>Back to home</Button>
    </Centered>
  )
}

export function CallSummary() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const c = useHost(id)
  const callId = sp.get('cid')
  const [rated, setRated] = useState(0)
  const [rating, setRating] = useState(false)

  const rate = async (stars) => {
    if (!callId || rating) return
    setRating(true)
    try {
      await callsApi.rate(callId, stars)
      setRated(stars)
    } catch {}
    setRating(false)
  }

  return (
    <Centered>
      <Avatar id={id} size={90} />
      <h1 className="mt-3 text-[19px] font-bold text-ink">{c?.name || '…'}</h1>
      <Card className="mt-4 grid w-full grid-cols-2 gap-4 p-4 text-left">
        <div><p className="text-[12px] text-subtle">Duration</p><p className="text-[18px] font-bold text-ink">{clock(+sp.get('d') || 0)}</p></div>
        <div><p className="text-[12px] text-subtle">Beans used</p><p className="text-[18px] font-bold text-gold">{beans(+sp.get('b') || 0)}</p></div>
      </Card>
      {callId && (
        <Card className="mt-3 w-full p-4">
          <p className="text-[13px] font-semibold text-ink">Rate this call</p>
          <div className="mt-2 flex justify-center gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => rate(n)} disabled={rating}>
                <Star size={26} className={n <= rated ? 'fill-gold text-gold' : 'text-gray-300 dark:text-white/20'} />
              </button>
            ))}
          </div>
        </Card>
      )}
      <Button variant="gold" className="mt-4 w-full py-3" onClick={() => nav('/add-balance')}><Plus size={16} /> Add balance</Button>
      <Button variant="outline" className="mt-3 w-full py-3" onClick={() => nav(`/chat/${id}`)}><MessageSquare size={16} /> Message {c?.name || ''}</Button>
      <button onClick={() => nav('/')} className="mt-4 text-[14px] font-semibold text-brand">Back to home</button>
    </Centered>
  )
}

export function GiftSent() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const c = useHost(id)
  const emoji = sp.get('emoji') || '🎁'
  const giftName = sp.get('name') || 'gift'
  return (
    <Centered>
      <Burst><Check size={26} /></Burst>
      <h1 className="mt-4 text-[20px] font-bold text-ink">{emoji} sent to {c?.name || 'creator'}</h1>
      <p className="mt-1 text-[13px] text-subtle">Deducted from your balance</p>
      <Card className="mt-5 flex w-full items-center gap-3 p-3.5 text-left">
        <Avatar id={id} size={36} ring ringColor="#e0a0a0" />
        <p className="flex-1 text-[13px] text-ink">{c?.name || 'They'} were sent your {giftName}.</p>
        <span className="text-xl">{emoji}</span>
      </Card>
      <Button variant="outline" className="mt-3 w-full py-3" onClick={() => nav(`/chat/${id}`)}>Open conversation</Button>
      <button onClick={() => nav('/')} className="mt-3 text-[14px] font-semibold text-brand">Back to home</button>
    </Centered>
  )
}

export function BlockFlow() {
  const { id } = useParams()
  const nav = useNavigate()
  const { state, actions, toast } = useApp()
  const c = useHost(id)
  const done = state.blocked.some((b) => b.id === id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (done) {
    return (
      <Centered>
        <Burst><Check size={26} /></Burst>
        <h1 className="mt-4 text-[20px] font-bold text-ink">{c?.name || 'Creator'} is blocked</h1>
        <p className="mt-1 text-[13px] text-subtle">They can no longer contact you</p>
        <p className="mt-5 w-full rounded-xl bg-brand-50 p-3 text-[12px] leading-relaxed text-brand dark:bg-brand/15">
          🛡️ Manage this anytime from Settings → Blocked creators.
        </p>
        <Button className="mt-3 w-full py-3" onClick={() => nav('/')}>Back to home</Button>
      </Centered>
    )
  }

  const block = async () => {
    setBusy(true)
    setError('')
    try {
      await actions.block(id, c?.name)
      toast(`${c?.name || 'Creator'} blocked`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not block this creator')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <span className="grid h-20 w-20 place-items-center rounded-full bg-rose-50 text-rose-500 dark:bg-rose-500/15"><Ban size={30} /></span>
      <h1 className="mt-4 text-[19px] font-bold text-ink">Block {c?.name || 'this creator'}?</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-subtle">
        You will no longer see this creator's content, and they cannot message or call you. You can unblock from Settings → Blocked creators.
      </p>
      {error && <p className="mt-2 text-[13px] font-medium text-rose-500">{error}</p>}
      <div className="mt-5 flex w-full gap-3">
        <Button variant="outline" className="flex-1 py-3" onClick={() => nav(-1)}>Cancel</Button>
        <Button variant="danger" className="flex-1 py-3" disabled={busy} onClick={block}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />} Block
        </Button>
      </div>
    </Centered>
  )
}

export function ReportFlow() {
  const { id } = useParams()
  const nav = useNavigate()
  const { toast } = useApp()
  const c = useHost(id)
  const [submitted, setSubmitted] = useState(false)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const reasons = ['Inappropriate behaviour', 'Nudity or sexual content', 'Harassment', 'Scam or fraud', 'Impersonation', 'Something else']

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await moderationApi.report('host', id, details ? `${reason}: ${details}` : reason)
      setSubmitted(true)
      toast('Report submitted')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit report')
    } finally {
      setBusy(false)
    }
  }

  if (submitted) {
    return (
      <Centered>
        <Burst><Check size={26} /></Burst>
        <h1 className="mt-4 text-[20px] font-bold text-ink">Report submitted</h1>
        <Card className="mt-5 w-full space-y-2.5 p-4 text-left text-[13px] text-ink">
          <p className="flex items-center gap-2"><ShieldAlert size={15} className="text-brand" /> Our safety team reviews within 24 hours</p>
          <p className="flex items-center gap-2"><MessageSquare size={15} className="text-brand" /> We'll follow up if we need more details</p>
        </Card>
        <Button className="mt-4 w-full py-3" onClick={() => nav('/')}>Back to home</Button>
      </Centered>
    )
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-[20px] font-bold text-ink">Report {c?.name || 'this creator'}</h1>
      <p className="mt-1 text-[13px] text-subtle">Tell us what happened. Serious reports are reviewed within 24 hours.</p>
      <div className="mt-4 space-y-2">
        {reasons.map((r) => (
          <button
            key={r}
            onClick={() => setReason(r)}
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-[14px] ${
              reason === r ? 'border-brand bg-brand-50 dark:bg-brand/15' : 'border-line'
            }`}
          >
            <span className={`grid h-5 w-5 place-items-center rounded-full border ${reason === r ? 'border-brand bg-brand text-white' : 'border-gray-300'}`}>
              {reason === r && <Check size={12} />}
            </span>
            {r}
          </button>
        ))}
      </div>
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        rows={3}
        placeholder="Add details (optional)"
        className="mt-3 w-full rounded-xl border border-line bg-canvas p-3 text-[14px] outline-none"
      />
      {error && <p className="mt-2 text-[13px] font-medium text-rose-500">{error}</p>}
      <Button className="mt-4 w-full py-3" disabled={!reason || busy} onClick={submit}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Flag size={16} />} Submit report
      </Button>
    </div>
  )
}

function Row({ k, v }) {
  return (
    <div className="flex items-center justify-between py-1 text-[14px]">
      <span className="text-subtle">{k}</span>
      <span className="font-bold text-ink">{v}</span>
    </div>
  )
}
