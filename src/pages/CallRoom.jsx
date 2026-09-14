import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Mic, MicOff, MessageSquare, Gift, PhoneOff, X, AlertTriangle, Loader2,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Avatar, Button } from '../components/ui'
import { clock } from '../lib/format'
import GiftPicker from '../components/GiftPicker'
import { callsApi, hostsApi, giftsApi, ApiError } from '../lib/api'
import { normalizeHost } from '../lib/normalize'

const POLL_MS = 5000

export default function CallRoom() {
  const { id: hostId } = useParams()
  const [sp] = useSearchParams()
  const mode = sp.get('mode') || 'video'
  const nav = useNavigate()
  const { state, actions, toast } = useApp()

  const [c, setC] = useState(null)
  const [call, setCall] = useState(null) // { callId, ratePaise }
  const [phase, setPhase] = useState('connecting') // connecting | active | ended | error
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [gift, setGift] = useState(false)
  const [chatLog, setChatLog] = useState([])

  const endedRef = useRef(false)
  const navRef = useRef(nav)
  navRef.current = nav
  const secondsRef = useRef(0)
  secondsRef.current = seconds

  // set up: fetch host (for name/avatar/rate) + initiate the call
  useEffect(() => {
    let alive = true
    Promise.all([hostsApi.get(hostId).catch(() => null), callsApi.initiate(hostId, mode === 'audio' ? 'voice' : mode)])
      .then(([hostRes, callRes]) => {
        if (!alive) return
        const host = hostRes ? normalizeHost(hostRes) : null
        setC(host)
        setCall({
          callId: callRes.callId || callRes.id,
          ratePaise: callRes.ratePerMinutePaise ?? callRes.ratePaise ?? host?.ratePaise ?? 0,
        })
        const t = setTimeout(() => alive && setPhase('active'), 1800)
        return () => clearTimeout(t)
      })
      .catch((err) => {
        if (!alive) return
        setError(err instanceof ApiError ? err.message : 'Could not connect this call')
        setPhase('error')
      })
    return () => { alive = false }
  }, [hostId, mode]) // eslint-disable-line

  const finish = async (reason) => {
    if (endedRef.current || !call?.callId) return
    endedRef.current = true
    try {
      const res = await callsApi.end(call.callId)
      actions.refreshWallet().catch(() => {})
      // The end-call response carries totalBeans/totalAmountPaise but no duration
      // field — the client's own elapsed timer is the only source for that.
      const b = res.totalBeans ?? ''
      const q = `?d=${seconds}${b !== '' ? `&b=${b}` : ''}&cid=${call.callId}`
      const dest = reason === 'balance' ? `/call-ended/${hostId}${q}` : reason === 'addbalance' ? '/add-balance' : `/call-summary/${hostId}${q}`
      navRef.current(dest, { replace: true })
    } catch {
      navRef.current('/', { replace: true })
    }
  }
  const finishRef = useRef(finish)
  finishRef.current = finish

  // local elapsed-time ticker (display only — billing itself is server-side)
  useEffect(() => {
    if (phase !== 'active') return
    const iv = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(iv)
  }, [phase])

  // poll server call + wallet state; react to server-side balance exhaustion or the host ending the call
  useEffect(() => {
    if (phase !== 'active' || !call?.callId) return
    const iv = setInterval(async () => {
      try {
        const [status, wallet] = await Promise.all([callsApi.get(call.callId), actions.refreshWallet()])
        const st = (status.status || '').toLowerCase()
        if (st && st !== 'active' && st !== 'ringing' && !endedRef.current) {
          endedRef.current = true
          const b = status.totalBeans ?? ''
          const q = `?d=${secondsRef.current}${b !== '' ? `&b=${b}` : ''}&cid=${call.callId}`
          navRef.current(st === 'missed' || wallet?.balancePaise <= 0 ? `/call-ended/${hostId}${q}` : `/call-summary/${hostId}${q}`, { replace: true })
        }
      } catch {}
    }, POLL_MS)
    return () => clearInterval(iv)
  }, [phase, call?.callId]) // eslint-disable-line

  const remainingSec = useMemo(() => {
    if (!call?.ratePaise || !state.wallet) return Infinity
    return Math.floor((state.wallet.balancePaise / call.ratePaise) * 60)
  }, [call?.ratePaise, state.wallet])

  useEffect(() => {
    if (phase === 'active' && remainingSec <= 0) finishRef.current('balance')
  }, [phase, remainingSec])

  if (phase === 'error') {
    return (
      <div className="fixed inset-0 z-[70] grid place-items-center bg-ink text-white">
        <div className="flex flex-col items-center px-6 text-center">
          <AlertTriangle size={32} className="text-gold" />
          <p className="mt-3 text-[16px] font-semibold">{error}</p>
          <button onClick={() => nav(-1)} className="mt-4 rounded-xl bg-white/15 px-4 py-2 text-[14px] font-semibold">Go back</button>
        </div>
      </div>
    )
  }

  const lowBalance = phase === 'active' && remainingSec < 120

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden text-white" style={{ background: 'linear-gradient(180deg,#3a2568 0%,#1a1236 45%,#0b0814 100%)' }}>
      {/* top bar */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2 rounded-full bg-black/35 px-3 py-1.5">
          <Avatar id={hostId} size={22} />
          <span className="text-[13px] font-semibold">{c?.name || '…'}</span>
          {phase === 'active' && <span className="text-[12px] text-white/70">⏱ {clock(seconds)}</span>}
        </div>
        <div className="flex items-center gap-2">
          {call?.ratePaise ? (
            <span className="rounded-full border border-gold/40 bg-black/35 px-3 py-1.5 text-[13px] font-semibold text-gold">
              ₹{(call.ratePaise / 100).toFixed(0)}/min
            </span>
          ) : null}
          <button onClick={() => finish('user')} className="grid h-8 w-8 place-items-center rounded-full bg-black/35"><X size={16} /></button>
        </div>
      </div>

      {/* stage */}
      <div className="relative flex flex-1 items-center justify-center">
        {mode === 'video' && phase === 'active' && (
          <div className="absolute right-4 top-4 h-36 w-28 rounded-2xl" style={{ background: 'radial-gradient(circle at 40% 35%,#7f9bd6,#4a6bb0)' }} />
        )}

        {phase === 'connecting' && (
          <div className="flex flex-col items-center">
            <div className="rounded-full border border-white/25 p-3"><Avatar id={hostId} size={150} /></div>
            <p className="mt-5 text-[22px] font-bold">{c?.name || '…'}</p>
            <p className="mt-1.5 flex items-center gap-2 text-[14px] text-white/70"><Loader2 size={14} className="animate-spin" /> Connecting…</p>
          </div>
        )}

        {phase === 'active' && (
          mode !== 'video' ? (
            <div className="flex flex-col items-center">
              <div className="rounded-full border border-white/20 p-2"><Avatar id={hostId} size={150} /></div>
              <p className="mt-4 text-[20px] font-bold">{c?.name}</p>
            </div>
          ) : (
            <div className="h-64 w-64 rounded-full bg-white/5" />
          )
        )}

        {showChat && phase === 'active' && (
          <div className="absolute bottom-4 left-4 w-72 rounded-2xl bg-black/45 p-3 backdrop-blur">
            <div className="thin-scroll max-h-40 space-y-1.5 overflow-y-auto text-[13px]">
              {chatLog.length === 0 && <p className="text-white/50">Sent gifts and notes show up here.</p>}
              {chatLog.map((m, i) => (
                <p key={i} className="text-right text-white">
                  <span className="inline-block rounded-xl bg-brand px-2.5 py-1">{m.text}</span>
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* low balance */}
      {lowBalance && (
        <div className="mx-4 mb-3 flex items-center justify-between rounded-2xl bg-black/45 p-2.5 pl-3">
          <span className="flex items-center gap-2 text-[13px]">
            <AlertTriangle size={16} className="text-gold" /> Low balance — about {Math.max(1, Math.floor(remainingSec / 60))} min left
          </span>
          <button onClick={() => finish('addbalance')} className="rounded-lg bg-gold px-3 py-1.5 text-[13px] font-bold text-ink">Add</button>
        </div>
      )}

      {/* controls */}
      <div className="flex items-center justify-center gap-4 pb-8">
        <Ctrl onClick={() => setMuted((m) => !m)} active={muted}>{muted ? <MicOff size={20} /> : <Mic size={20} />}</Ctrl>
        <Ctrl onClick={() => setShowChat((s) => !s)} active={showChat}><MessageSquare size={20} /></Ctrl>
        <Ctrl onClick={() => setGift(true)}><Gift size={20} /></Ctrl>
        <button onClick={() => finish('user')} className="grid h-14 w-14 place-items-center rounded-full bg-rose-500 text-white">
          <PhoneOff size={22} />
        </button>
      </div>

      {gift && (
        <GiftPicker
          balance={state.wallet?.balancePaise ?? 0}
          onClose={() => setGift(false)}
          onSend={async (g) => {
            await giftsApi.send(hostId, g.id, 'call', call?.callId)
            await actions.refreshWallet()
            setGift(false)
            toast(`Sent ${g.name}`)
            setChatLog((l) => [...l, { text: `Sent a ${g.name}` }])
          }}
        />
      )}
    </div>
  )
}

function Ctrl({ children, onClick, active }) {
  return (
    <button onClick={onClick} className={`grid h-12 w-12 place-items-center rounded-full ${active ? 'bg-white text-ink' : 'bg-white/15 text-white'}`}>
      {children}
    </button>
  )
}
