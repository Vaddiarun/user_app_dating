/* Support chat and Refer & earn for users — the same backend features the Host app has. */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, LifeBuoy, Send, Loader2, Gift, Copy, Check, Share2, Users, ImagePlus } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Card, Button, EmptyState } from '../components/ui'
import { supportApi, referralsApi, uploadToS3, ApiError } from '../lib/api'
import { compressImage } from '../lib/chatImage'
import { getSocket, onSocketEvent } from '../lib/socket'

function Sub({ title, subtitle, back = '/profile', backLabel = 'Settings', children }) {
  const nav = useNavigate()
  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => nav(back)} className="mb-3 flex items-center gap-1 text-[13px] font-medium text-subtle hover:text-ink">
        <ChevronLeft size={16} /> {backLabel}
      </button>
      <h1 className="text-[21px] font-extrabold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-0.5 text-[13px] text-subtle">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '')
const dayOf = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '')

/* ---- Support chat ---- */
export function SupportChat() {
  const [state, setState] = useState('loading') // loading | ready | unavailable | error
  const [ticket, setTicket] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  // After the user writes, the automatic assistant usually answers within seconds (if it's
  // switched on) — show that it's replying, but never for more than 30 seconds.
  const [awaitingReply, setAwaitingReply] = useState(false)
  const bottomRef = useRef(null)
  useEffect(() => {
    if (!awaitingReply) return
    const t = setTimeout(() => setAwaitingReply(false), 30_000)
    return () => clearTimeout(t)
  }, [awaitingReply])

  const openTicket = (id) => supportApi.getTicket(id).then((res) => { setTicket(res.ticket || res); setMessages(res.messages || []) })
  const load = () => {
    setState('loading')
    supportApi.listTickets()
      .then(async (res) => {
        const latest = (res.tickets || [])[0] // most recently active first (a closed one shows read-only)
        if (latest) await openTicket(latest.id)
        setState('ready')
      })
      .catch((err) => setState(err instanceof ApiError && err.status === 404 ? 'unavailable' : 'error'))
  }
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }) }, [messages.length, awaitingReply])


  // Safety net next to the live socket event: re-check the open ticket every 5 seconds while the
  // chat is on screen, so a reply always shows up without leaving and reopening the chat.
  const sendingRef = useRef(false)
  sendingRef.current = sending
  useEffect(() => {
    if (!ticket?.id) return
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible' || sendingRef.current) return
      supportApi.getTicket(ticket.id).then((res) => {
        const next = res.messages || []
        // Picks up support closing the ticket (status) or handing it to the team (needsAgent).
        const fresh = res.ticket || res
        setTicket((cur) => (cur && (cur.needsAgent !== fresh.needsAgent || cur.status !== fresh.status) ? fresh : cur))
        setMessages((cur) => (next.length !== cur.filter((m) => !String(m.id).startsWith('local-')).length ? next : cur))
      }).catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [ticket?.id])
  // Support's replies arrive live (socket event support:message → { ticketId, message }).
  useEffect(() => {
    let cancelled = false
    let off = () => {}
    const attach = () => {
      if (cancelled) return
      if (!getSocket()) { setTimeout(attach, 400); return }
      off = onSocketEvent('support:message', ({ ticketId, message } = {}) => {
        if (!message || (ticket && ticketId !== ticket.id)) return
        setMessages((m) => (m.some((x) => x.id === message.id) ? m : [...m, message]))
        setAwaitingReply(false)
        // A reply can hand the ticket to the team (needsAgent) — refresh it for the banner.
        if (ticketId) supportApi.getTicket(ticketId).then((res) => setTicket(res.ticket || res)).catch(() => {})
      })
    }
    attach()
    return () => { cancelled = true; off() }
  }, [ticket])

  // Sends text, a photo, or both (the typed text becomes the photo's caption). A photo is
  // shrunk on the device, uploaded straight to storage, then sent with the key it was given.
  // `preset` is a fixed message (the "Talk to a person" button) that leaves the input alone.
  const send = async ({ preset, photo } = {}) => {
    const content = (preset ?? text).trim()
    if ((!content && !photo) || sending) return
    setSending(true)
    setError('')
    if (preset === undefined) setText('')
    const previewUrl = photo ? URL.createObjectURL(photo) : null
    setMessages((m) => [...m, {
      id: `local-${Date.now()}`, sender: 'user', content,
      attachments: previewUrl ? [{ type: 'image', url: previewUrl }] : [],
      createdAt: new Date().toISOString(),
    }])
    try {
      let mediaKey
      if (photo) {
        const blob = await compressImage(photo)
        const presign = await supportApi.attachmentUploadUrl(blob.type)
        await uploadToS3(presign.uploadUrl, blob, blob.type)
        mediaKey = presign.mediaKey
      }
      if (ticket) {
        await supportApi.reply(ticket.id, content, mediaKey)
        await openTicket(ticket.id)
      } else {
        const subject = content.slice(0, 80) || 'Photo attached'
        const created = await supportApi.createTicket({ subject, category: 'other', content, mediaKey })
        await openTicket(created.ticket?.id || created.id)
      }
      setAwaitingReply(true)
    } catch (err) {
      setMessages((m) => m.filter((x) => !String(x.id).startsWith('local-')))
      if (preset === undefined) setText(content)
      setError(err instanceof ApiError ? err.message : 'Message not sent. Try again.')
    } finally {
      setSending(false)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }
  const photoInputRef = useRef(null)
  // A ticket support has closed is read-only. Writing again starts a NEW ticket (it doesn't
  // reopen the old one), so each issue stays its own conversation for the team.
  const closed = ticket?.status === 'closed'
  const startNewChat = () => { setTicket(null); setMessages([]); setAwaitingReply(false); setError('') }

  return (
    <Sub title="Support chat" subtitle={closed ? 'This chat is closed' : 'Our team replies here'} back="/settings/support" backLabel="Help & support">
      <Card className="flex min-h-[60vh] flex-col overflow-hidden">
        <div className="thin-scroll flex-1 space-y-3 overflow-y-auto p-4">
          {state === 'loading' && <div className="grid place-items-center py-10"><Loader2 size={20} className="animate-spin text-subtle" /></div>}
          {state === 'unavailable' && <EmptyState icon={<LifeBuoy size={26} />} title="Support chat is coming soon" text="You'll be able to message our team right here." />}
          {state === 'error' && (
            <EmptyState icon={<LifeBuoy size={26} />} tone="rose" title="Could not load your support chat" text="Check your connection and try again.">
              <Button className="mt-3" onClick={load}>Retry</Button>
            </EmptyState>
          )}
          {state === 'ready' && (
            <>
              <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-gray-100 px-3.5 py-2.5 text-[14px] text-ink dark:bg-white/10">
                Hi! Tell us what happened — include the call or payment if it's about one — and our team will get back to you here.
              </div>
              {messages.map((m) => {
                const mine = m.sender === 'user'
                const bot = m.sender === 'bot'
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[14px] ${mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-gray-100 text-ink dark:bg-white/10'}`}>
                      {!mine && (
                        <span className="mb-0.5 flex items-center gap-1.5 text-[11px] font-bold text-brand">
                          {bot ? 'Support assistant' : m.senderName || 'Support'}
                          {bot && <span className="rounded-full bg-brand/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-brand">Automated</span>}
                        </span>
                      )}
                      {(m.attachments || []).filter((a) => a.type === 'image').map((a, i) => (
                        <a key={i} href={a.url} target="_blank" rel="noreferrer" className="mb-1 block">
                          <img src={a.url} alt="Attached photo" className="max-h-56 max-w-full rounded-xl object-cover" />
                        </a>
                      ))}
                      {m.content && <span className="whitespace-pre-wrap">{m.content}</span>}
                      <span className={`mt-1 block text-[10px] ${mine ? 'text-white/70' : 'text-subtle'}`}>{timeOf(m.createdAt)}</span>
                    </div>
                  </div>
                )
              })}
              {closed && (
                <div className="flex items-center gap-3 py-2 text-[12px] text-subtle">
                  <span className="h-px flex-1 bg-line" />
                  Chat closed by support
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}
              {awaitingReply && !closed && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-gray-100 px-3.5 py-2.5 text-[13px] text-subtle dark:bg-white/10">
                    <Loader2 size={13} className="animate-spin" /> Assistant is replying…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>
        {state === 'ready' && closed && (
          <div className="border-t border-line p-4 text-center">
            <p className="text-[14px] font-semibold text-ink">This chat has been closed</p>
            <p className="mt-0.5 text-[12px] text-subtle">Still need help? Start a new chat and we'll pick it up.</p>
            <Button className="mt-3 w-full py-3" onClick={startNewChat}>Start a new chat</Button>
          </div>
        )}
        {state === 'ready' && !closed && (
          <div className="border-t border-line p-3">
            {ticket?.needsAgent && (
              <p className="mb-2 rounded-xl bg-brand/10 px-3 py-2 text-[12px] font-medium text-brand">Our support team will reply here.</p>
            )}
            {ticket && !ticket.needsAgent && (
              <button
                onClick={() => send({ preset: 'I’d like to talk to a person.' })}
                disabled={sending}
                className="mb-2 rounded-full border border-line px-3 py-1 text-[12px] font-medium text-subtle hover:border-brand-200 hover:text-ink disabled:opacity-40"
              >
                Talk to a person
              </button>
            )}
            {error && <p className="mb-2 text-[12px] font-medium text-rose-500">{error}</p>}
            <div className="flex items-center gap-2">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { send({ photo: e.target.files?.[0] }); e.target.value = '' }}
              />
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={sending}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-subtle hover:text-ink disabled:opacity-40"
                aria-label="Attach a photo"
              >
                <ImagePlus size={17} />
              </button>
              <input
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 2000))}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Type your message…"
                className="flex-1 rounded-full border border-line bg-canvas px-4 py-2.5 text-[14px] outline-none focus:border-brand-200"
              />
              <button onClick={() => send()} disabled={sending || !text.trim()} className="grid h-10 w-10 place-items-center rounded-full bg-brand text-white disabled:opacity-40" aria-label="Send">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        )}
      </Card>
    </Sub>
  )
}

/* ---- Refer & earn ---- */
export function ReferAndEarn() {
  const { state } = useApp()
  const code = state.user?.referralCode || null
  const [copied, setCopied] = useState(false)
  const [list, setList] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    referralsApi.list()
      .then((res) => setList(res.referrals || []))
      .catch((err) => (err instanceof ApiError && err.status === 404 ? setList([]) : setError('Could not load your referrals.')))
  }, [])

  const link = code ? `${window.location.origin}/onboarding/phone?ref=${encodeURIComponent(code)}` : ''
  const copy = () => {
    if (!code) return
    navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }).catch(() => {})
  }
  const share = () => {
    if (!code) return
    const text = `Join me on the app! Use my referral code ${code} when you sign up.`
    if (navigator.share) navigator.share({ title: 'Join me', text, url: link }).catch(() => {})
    else navigator.clipboard?.writeText(`${text} ${link}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }).catch(() => {})
  }

  return (
    <Sub title="Refer and earn" subtitle="Invite friends to join">
      <div className="space-y-3">
        <div className="flex flex-col items-center rounded-2xl bg-brand px-5 py-6 text-center text-white">
          <Gift size={32} />
          <p className="mt-2.5 text-[17px] font-bold">Invite your friends</p>
          <p className="mt-0.5 text-[13px] text-white/85">Share your code. Rewards for referrals are coming soon.</p>
        </div>
        <div className="grid h-16 place-items-center rounded-2xl bg-brand-50 dark:bg-brand/15">
          {code
            ? <span className="text-[24px] font-black tracking-[0.12em] text-brand">{code}</span>
            : <span className="text-[13px] font-medium text-brand">Your referral code will appear here soon</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={copy} disabled={!code} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card text-[14px] font-semibold text-brand disabled:opacity-50">
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy code'}
          </button>
          <button onClick={share} disabled={!code} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card text-[14px] font-semibold text-brand disabled:opacity-50">
            <Share2 size={16} /> Share link
          </button>
        </div>

        <p className="pt-3 text-[12px] font-bold uppercase tracking-wide text-subtle">Friends who joined</p>
        <Card className="divide-y divide-line">
          {error && <p className="px-4 py-4 text-[13px] text-rose-500">{error}</p>}
          {!list && !error && <div className="grid place-items-center py-8"><Loader2 size={18} className="animate-spin text-subtle" /></div>}
          {list && list.length === 0 && (
            <div className="flex flex-col items-center px-4 py-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand dark:bg-brand/15"><Users size={20} /></span>
              <p className="mt-2 text-[14px] font-semibold text-ink">No one yet</p>
              <p className="text-[12px] text-subtle">Friends who sign up with your code show up here.</p>
            </div>
          )}
          {list?.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-[13px] font-bold text-brand dark:bg-brand/15">{(r.name || '?').slice(0, 1).toUpperCase()}</span>
              <span className="flex-1 text-[14px] font-semibold text-ink">{r.name || 'New member'}</span>
              <span className="text-[12px] text-subtle">Joined {dayOf(r.joinedAt)}</span>
            </div>
          ))}
        </Card>
      </div>
    </Sub>
  )
}
