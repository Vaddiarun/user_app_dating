import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Eye, Radio, Heart, Gift, X, Send, Loader2 } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Avatar, GradientBox, EmptyState } from '../components/ui'
import { compact, userName } from '../lib/format'
import GiftPicker from '../components/GiftPicker'
import Watermark from '../components/Watermark'
import { liveApi, giftsApi, ApiError } from '../lib/api'

const G = [['#9b8fe0', '#5b28d6'], ['#5fc9a0', '#2f9878'], ['#e6b980', '#c9822b'], ['#d68f9b', '#9b3f5f']]

function normalizeBroadcast(b) {
  const host = b.host || {}
  return {
    id: b.id,
    hostId: b.hostId || host.id,
    hostName: host.name || b.hostName || 'Creator',
    category: b.category || host.category || '',
    viewers: b.viewerCount ?? b.viewers ?? 0,
  }
}

export default function Live() {
  const [rooms, setRooms] = useState(null)
  const [error, setError] = useState('')
  const nav = useNavigate()

  useEffect(() => {
    liveApi.list()
      .then((res) => setRooms((res.broadcasts || res.items || []).map(normalizeBroadcast)))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load live broadcasts'))
  }, [])

  if (rooms === null && !error) {
    return <div className="grid place-items-center py-24"><Loader2 size={26} className="animate-spin text-subtle" /></div>
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-[22px] font-extrabold tracking-tight text-ink">Live now</h1>

      {error ? (
        <EmptyState icon={<Radio size={28} />} tone="rose" title="Could not load live broadcasts" text={error} />
      ) : rooms.length === 0 ? (
        <EmptyState icon={<Radio size={28} />} tone="gold" title="No one is live right now" text="Check back soon — live sessions show up here as soon as a creator starts one." />
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((r, i) => (
            <button key={r.id} onClick={() => nav(`/live/${r.id}`)} className="text-left">
              <GradientBox from={G[i % G.length][0]} to={G[i % G.length][1]} seed={i} className="aspect-video rounded-2xl">
                <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" /> Live
                </span>
                <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  <Eye size={12} /> {compact(r.viewers)}
                </span>
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-3">
                  <Avatar id={r.hostId} size={24} />
                  <span className="text-[14px] font-semibold text-white">{r.hostName}</span>
                  {r.category && <span className="text-[11px] text-white/70">· {r.category}</span>}
                </div>
              </GradientBox>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function LiveRoom() {
  const { id } = useParams()
  const nav = useNavigate()
  const { state, actions, toast } = useApp()
  const [room, setRoom] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [hearts, setHearts] = useState([])
  const [gift, setGift] = useState(false)
  const feedRef = useRef(null)
  const joinedRef = useRef(false)

  useEffect(() => {
    let alive = true
    liveApi.list()
      .then((res) => {
        const found = (res.broadcasts || res.items || []).map(normalizeBroadcast).find((b) => b.id === id)
        if (alive) setRoom(found || null)
      })
      .catch(() => {})
    liveApi.join(id).then(() => { joinedRef.current = true }).catch(() => {})
    return () => {
      alive = false
      if (joinedRef.current) liveApi.leave(id).catch(() => {})
    }
  }, [id])

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs.length])

  const addHeart = () => {
    const h = { id: Date.now() + Math.random(), x: 10 + Math.random() * 40 }
    setHearts((hs) => [...hs, h])
    setTimeout(() => setHearts((hs) => hs.filter((x) => x.id !== h.id)), 2200)
  }

  const sendChat = async () => {
    const t = text.trim()
    if (!t) return
    setText('')
    setMsgs((m) => [...m, { id: Date.now(), n: userName(state.user), t }])
    try { await liveApi.chat(id, t) } catch { toast('Could not send message') }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex select-none flex-col overflow-hidden text-white"
      style={{ background: 'linear-gradient(180deg,#3a2568 0%,#1a1236 50%,#0b0814 100%)' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between px-4 pt-4">
        <button onClick={() => nav(room?.hostId ? `/creator/${room.hostId}` : '/live')} className="flex items-center gap-2 rounded-full bg-black/35 px-2 py-1.5">
          <Avatar id={room?.hostId || id} size={22} />
          <span className="text-[13px] font-semibold">{room?.hostName || '…'}</span>
          <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold uppercase">Live</span>
        </button>
        <div className="flex items-center gap-2">
          {room && <span className="rounded-full bg-black/35 px-2.5 py-1.5 text-[12px] font-semibold">👥 {compact(room.viewers)}</span>}
          <button onClick={() => nav('/live')} className="grid h-8 w-8 place-items-center rounded-full bg-black/35"><X size={16} /></button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center">
        <Watermark user={state.user} />
        <div className="h-64 w-64 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute bottom-0 right-6 h-full w-16">
          {hearts.map((h) => (
            <Heart key={h.id} size={22} className="absolute bottom-4 animate-floatUp fill-rose-400 text-rose-400" style={{ left: h.x }} />
          ))}
        </div>
      </div>

      <div ref={feedRef} className="thin-scroll max-h-44 space-y-1.5 overflow-y-auto px-4">
        {msgs.length === 0 && <p className="text-[13px] text-white/50">Say something to join the conversation</p>}
        {msgs.map((m) => (
          <div key={m.id} className="w-fit rounded-full bg-black/40 px-3 py-1.5 text-[13px]">
            <span className="font-semibold">{m.n}</span> <span className="text-white/85">{m.t}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 p-3 pb-6">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendChat()}
          placeholder="Say something…"
          className="flex-1 rounded-full bg-black/40 px-4 py-2.5 text-[13px] text-white outline-none placeholder:text-white/50"
        />
        <button onClick={addHeart} className="grid h-11 w-11 place-items-center rounded-full bg-black/40"><Heart size={19} /></button>
        <button onClick={() => setGift(true)} className="grid h-11 w-11 place-items-center rounded-full bg-gold text-ink"><Gift size={19} /></button>
      </div>

      {gift && (
        <GiftPicker
          balance={state.wallet?.balancePaise ?? 0}
          onClose={() => setGift(false)}
          onSend={async (g) => {
            if (!state.wallet || state.wallet.balancePaise < g.pricePaise) { toast('Not enough balance'); throw new Error('insufficient') }
            await giftsApi.send(room?.hostId || id, g.id, 'live', id)
            await actions.refreshWallet()
            setGift(false)
            setMsgs((m) => [...m, { id: Date.now(), n: userName(state.user), t: `sent a ${g.name}` }])
            toast(`Sent ${g.name}`)
          }}
        />
      )}
    </div>
  )
}
