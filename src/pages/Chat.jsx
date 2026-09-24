import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Send, Gift, Phone, Video, MoreVertical, ArrowLeft, Inbox, ShieldCheck, Flag, Ban, User, Loader2,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Avatar, Button, EmptyState, Modal } from '../components/ui'
import { relTime, timeOfDay } from '../lib/format'
import GiftPicker from '../components/GiftPicker'
import { CallModal } from './Home'
import { chatApi, hostsApi, giftsApi, ApiError } from '../lib/api'
import { normalizeHost } from '../lib/normalize'
import { useHostAvatarUrl } from '../lib/hostGallery'

// Verified against the live backend: GET /chat/conversations returns
// { conversations: [{ id, userId, hostId, lastMessageAt, createdAt, otherParticipant: { id, name, phone, role } }] }
// — there's no last-message preview or unread count in that response at all,
// so a conversation row can't show either without fabricating them.
function normalizeConversation(c) {
  const other = c.otherParticipant || {}
  return {
    conversationId: c.id || c.conversationId,
    hostId: c.hostId || other.id,
    hostName: other.name || 'Creator',
    lastTs: c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : c.createdAt ? new Date(c.createdAt).getTime() : Date.now(),
  }
}

// GET /chat/conversations/:id/messages returns { messages: [{ id, conversationId, senderId, content, createdAt }] }
// — "mine" has to be senderId compared against the logged-in user's own id
// (passed in as viewerId), not any field on the message itself.
function normalizeMessage(m, viewerId) {
  return {
    id: m.id,
    mine: !!viewerId && m.senderId === viewerId,
    text: m.content || m.text || '',
    ts: m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
  }
}

export default function Chat() {
  const { id } = useParams()
  const nav = useNavigate()
  const { state } = useApp()
  const [convos, setConvos] = useState(null)
  const [error, setError] = useState('')

  const load = () => {
    chatApi.conversations()
      .then((res) => setConvos((res.conversations || res.items || res || []).map(normalizeConversation)))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load conversations'))
  }

  useEffect(() => {
    load()
    const iv = setInterval(load, 8000)
    return () => clearInterval(iv)
  }, [])

  const visible = useMemo(
    () => (convos || []).filter((c) => !state.blocked.some((b) => b.id === c.hostId)).sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0)),
    [convos, state.blocked],
  )

  if (convos === null && !error) {
    return <div className="grid place-items-center py-24"><Loader2 size={26} className="animate-spin text-subtle" /></div>
  }

  if (visible.length === 0 && !id) {
    return (
      <EmptyState
        icon={<Inbox size={28} />}
        title="No conversations yet"
        text="Find a creator you like on Home and start a conversation from their profile."
      >
        <Button onClick={() => nav('/')}>Discover creators</Button>
      </EmptyState>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="grid h-[calc(100dvh-8.5rem)] overflow-hidden rounded-2xl border border-line bg-card md:grid-cols-[300px_1fr]">
        {/* list */}
        <div className={`min-h-0 flex-col border-r border-line ${id ? 'hidden md:flex' : 'flex'}`}>
          <div className="border-b border-line px-4 py-3 text-[15px] font-bold text-ink">Messages</div>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
            {visible.map((cv) => (
              <button
                key={cv.hostId}
                onClick={() => nav(`/chat/${cv.hostId}`)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                  id === cv.hostId ? 'bg-brand-50 dark:bg-brand/15' : 'hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
              >
                <ConversationAvatar hostId={cv.hostId} size={42} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ink">{cv.hostName}</p>
                </div>
                <span className="text-[11px] text-subtle">{relTime(cv.lastTs)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* conversation */}
        {id ? (
          <Conversation key={id} hostId={id} conversationId={convos?.find((c) => c.hostId === id)?.conversationId} />
        ) : (
          <div className="hidden place-items-center text-[14px] text-subtle md:grid">Select a conversation</div>
        )}
      </div>
    </div>
  )
}

function Conversation({ hostId, conversationId: initialConvId }) {
  const nav = useNavigate()
  const { state, actions, toast } = useApp()
  const [c, setC] = useState(null)
  const [conversationId, setConversationId] = useState(initialConvId || null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [menu, setMenu] = useState(false)
  const [gift, setGift] = useState(false)
  const [call, setCall] = useState(false)
  const scrollRef = useRef(null)

  const blocked = state.blocked.some((b) => b.id === hostId)
  // The first gallery photo doubles as the profile pic wherever avatarUrl isn't set.
  const avatarUrl = useHostAvatarUrl(c)

  useEffect(() => {
    let alive = true
    hostsApi.get(hostId).then((res) => alive && setC(normalizeHost(res))).catch(() => {})
    return () => { alive = false }
  }, [hostId])

  // Landing here directly (e.g. "Message {name}" from a creator profile or call
  // summary) mounts before the parent's conversation list has loaded, so the
  // real conversationId often isn't known yet at mount time. Pick it up once it
  // resolves instead of staying stuck with no messages forever.
  useEffect(() => {
    if (initialConvId && initialConvId !== conversationId) setConversationId(initialConvId)
  }, [initialConvId]) // eslint-disable-line

  const loadMessages = (cid) => {
    if (!cid) { setLoading(false); return }
    chatApi.messages(cid, 1, 50)
      .then((res) => {
        // The API returns page 1 as the newest messages first (descending).
        // Reverse to chronological order so the feed reads oldest-to-newest,
        // top-to-bottom, like Instagram/WhatsApp — not newest-on-top.
        const list = (res.messages || res.items || []).map((m) => normalizeMessage(m, state.user?.id))
        list.reverse()
        setMessages(list)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setLoading(true)
    if (conversationId) loadMessages(conversationId)
    else setLoading(false)
    if (!conversationId) return
    const iv = setInterval(() => loadMessages(conversationId), 4000)
    return () => clearInterval(iv)
  }, [conversationId]) // eslint-disable-line

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const send = async () => {
    const t = text.trim()
    if (!t || blocked || sending) return
    setSending(true)
    setText('')
    try {
      const res = await chatApi.send(hostId, t)
      const cid = res.conversationId || res.id || conversationId
      if (!conversationId && cid) setConversationId(cid)
      setMessages((m) => [...m, { id: `local-${Date.now()}`, mine: true, text: t, ts: Date.now() }])
      loadMessages(cid)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not send message', { tone: 'error' })
    } finally {
      setSending(false)
    }
  }

  const sendGift = async (g) => {
    if (!state.wallet || state.wallet.balancePaise < g.pricePaise) { toast('Not enough balance', { tone: 'error' }); throw new Error('insufficient') }
    await giftsApi.send(hostId, g.id, 'chat', conversationId)
    await actions.refreshWallet()
    setGift(false)
    nav(`/gift-sent/${hostId}?name=${encodeURIComponent(g.name)}`)
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button className="md:hidden" onClick={() => nav('/chat')}><ArrowLeft size={20} /></button>
        <button onClick={() => nav(`/creator/${hostId}`)} className="flex items-center gap-2.5">
          <Avatar id={hostId} photoUrl={avatarUrl} size={38} ring ringColor="#e0a0a0" />
          <div className="text-left">
            <p className="text-[15px] font-semibold text-ink">{c?.name || '…'}</p>
            <p className={`text-[12px] font-medium ${c?.online ? 'text-green-600' : 'text-subtle'}`}>{c?.online ? 'Online now' : 'Offline'}</p>
          </div>
        </button>
        <div className="flex-1" />
        <button onClick={() => setCall(true)} className="rounded-lg border border-line p-2 hover:bg-gray-50 dark:hover:bg-white/5"><Phone size={16} /></button>
        <button onClick={() => setCall(true)} className="rounded-lg bg-brand p-2 text-white"><Video size={16} /></button>
        <button onClick={() => setMenu(true)} className="rounded-lg border border-line p-2 hover:bg-gray-50 dark:hover:bg-white/5"><MoreVertical size={16} /></button>
      </div>

      <div ref={scrollRef} className="thin-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-md rounded-xl bg-gray-100 p-3 text-center text-[12px] leading-relaxed text-subtle dark:bg-white/5">
          <ShieldCheck size={13} className="mr-1 inline" /> Conversations are private between you and the creator, and may be reviewed if reported for safety.
        </div>
        {loading ? (
          <div className="grid place-items-center py-8"><Loader2 size={20} className="animate-spin text-subtle" /></div>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-subtle">Say hi 👋 to start the conversation</p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} m={m} />)
        )}
      </div>

      {blocked ? (
        <div className="border-t border-line px-4 py-4 text-center text-[13px] text-subtle">
          You blocked {c?.name || 'this creator'}. Manage this from Settings → Blocked creators.
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-line px-3 py-3">
          <button onClick={() => setGift(true)} className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand dark:bg-brand/15">
            <Gift size={18} />
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder={`Message ${c?.name || ''}`}
            className="flex-1 rounded-full border border-line bg-canvas px-4 py-2.5 text-[14px] outline-none focus:border-brand-200"
          />
          <button onClick={send} className="grid h-10 w-10 place-items-center rounded-full bg-brand text-white disabled:opacity-40" disabled={!text.trim() || sending}>
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      )}

      <CallModal creator={call ? c : null} onClose={() => setCall(false)} onStart={(mode) => { setCall(false); nav(`/call/${hostId}?mode=${mode}`) }} />

      <Modal open={menu} onClose={() => setMenu(false)} title="More options">
        <div className="divide-y divide-line">
          <MRow icon={<User size={18} className="text-brand" />} title="View profile" onClick={() => nav(`/creator/${hostId}`)} />
          <MRow icon={<Flag size={18} className="text-gold" />} title="Report creator" onClick={() => nav(`/report/${hostId}`)} />
          <MRow icon={<Ban size={18} className="text-rose-500" />} title="Block creator" onClick={() => nav(`/block/${hostId}`)} />
        </div>
      </Modal>

      {gift && (
        <GiftPicker
          balance={state.wallet?.balancePaise ?? 0}
          onClose={() => setGift(false)}
          onSend={sendGift}
        />
      )}
    </div>
  )
}

function ConversationAvatar({ hostId, size }) {
  const avatarUrl = useHostAvatarUrl({ id: hostId, avatarUrl: null })
  return <Avatar id={hostId} photoUrl={avatarUrl} size={size} />
}

function MessageBubble({ m }) {
  return (
    <div className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${m.mine ? 'bg-brand text-white' : 'bg-gray-100 text-ink dark:bg-white/10'}`}>
        <p className="text-[14px] leading-snug">{m.text}</p>
        <p className={`mt-1 text-[10px] ${m.mine ? 'text-white/70' : 'text-subtle'}`}>{timeOfDay(m.ts)}</p>
      </div>
    </div>
  )
}

function MRow({ icon, title, onClick }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 py-3 text-left">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gray-100 dark:bg-white/10">{icon}</span>
      <span className="text-[15px] font-semibold text-ink">{title}</span>
    </button>
  )
}
