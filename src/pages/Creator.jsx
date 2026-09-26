import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  BadgeCheck, Heart, MessageSquare, Gift, Video, Play, MoreHorizontal, EyeOff, Flag, Ban, Users, Loader2, RotateCw,
  X, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Avatar, GradientBox, Button, Card, Segmented, Modal, EmptyState } from '../components/ui'
import { compact } from '../lib/format'
import { CallModal } from './Home'
import GiftPicker from '../components/GiftPicker'
import { hostsApi, giftsApi, ApiError } from '../lib/api'
import { normalizeHost } from '../lib/normalize'
import { useHostOnline } from '../lib/socket'

const MEDIA_G = [
  ['#7f9bd6', '#4a6bb0'], ['#a99be8', '#6a4fd0'], ['#e6c07a', '#c9962b'],
  ['#7fd6a8', '#3fa878'], ['#d68f9b', '#b05f6f'], ['#8fb0e8', '#5f7fc0'],
  ['#9b8fe0', '#5b28d6'], ['#e6c07a', '#c9962b'], ['#7fd6a8', '#3fa878'],
]

export default function Creator() {
  const { id } = useParams()
  const nav = useNavigate()
  const { state, actions, toast } = useApp()
  const [c, setC] = useState(null)
  const online = useHostOnline(id, c?.online)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('Details')
  const [menu, setMenu] = useState(false)
  const [call, setCall] = useState(false)
  const [gift, setGift] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [galleryItems, setGalleryItems] = useState([])
  const [viewerIndex, setViewerIndex] = useState(null)

  const load = () => {
    setLoading(true)
    setError('')
    hostsApi.get(id)
      .then((res) => setC(normalizeHost(res)))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this creator'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id]) // eslint-disable-line

  // A dedicated per-host gallery endpoint — separate from GET /hosts/:id,
  // whose own `gallery` field is always empty. This route doesn't exist yet
  // on the backend (404s until it's added); failures are swallowed so the
  // page still works, just showing the placeholder tiles in the meantime.
  useEffect(() => {
    let alive = true
    hostsApi.gallery(id)
      .then((res) => {
        if (!alive) return
        const items = (res.items || res.gallery || []).map((it) => ({
          id: it.id,
          url: it.url,
          type: it.mediaType === 'video' ? 'video' : 'photo',
        }))
        setGalleryItems(items)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [id])

  if (loading) return <div className="grid place-items-center py-24"><Loader2 size={26} className="animate-spin text-subtle" /></div>
  if (error || !c) {
    return (
      <EmptyState icon={<RotateCw size={26} />} tone="rose" title="Creator not found" text={error || 'This profile may have been removed.'}>
        <Button onClick={load}>Retry</Button>
      </EmptyState>
    )
  }

  // The first gallery photo doubles as the profile pic wherever avatarUrl isn't set.
  const avatarUrl = c.avatarUrl || galleryItems.find((it) => it.type === 'photo')?.url || null

  const following = state.following.includes(c.id) || c.isFollowing

  const toggleFollow = async () => {
    setFollowBusy(true)
    try {
      if (following) { await actions.unfollow(c.id); toast(`Unfollowed ${c.name}`) }
      else { await actions.follow(c.id); toast(`Following ${c.name}`) }
    } catch {
      toast('Could not update follow status', { tone: 'error' })
    } finally {
      setFollowBusy(false)
    }
  }

  const sendGift = async (g) => {
    if (!state.wallet || state.wallet.balancePaise < g.pricePaise) { toast('Not enough balance', { tone: 'error' }); throw new Error('insufficient') }
    await giftsApi.send(c.id, g.id, 'profile')
    await actions.refreshWallet()
    setGift(false)
    nav(`/gift-sent/${c.id}?name=${encodeURIComponent(g.name)}`)
  }

  const startChat = async () => {
    nav(`/chat/${c.id}`)
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Left rail */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card className="p-5">
            <div className="flex items-start gap-4">
              <Avatar id={c.id} photoUrl={avatarUrl} size={72} ring ringColor={online ? '#2fb37a' : '#c9c9d2'} />
              <div className="min-w-0 pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[19px] font-bold text-ink">{c.name}</span>
                  {c.verified && <BadgeCheck size={16} className="text-brand" />}
                </div>
                <p className="text-[13px] text-subtle">{c.languages?.join(', ')}{c.age ? ` · ${c.age} yrs` : ''}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                  <span className={`flex items-center gap-1 font-medium ${online ? 'text-green-600' : 'text-subtle'}`}>
                    <span className={`h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-gray-400'}`} /> {online ? 'Online' : 'Offline'}
                  </span>
                  {c.live && <span className="font-medium text-rose-500">● Live now</span>}
                  <span className="text-subtle">{compact(c.followerCount)} followers</span>
                </div>
              </div>
            </div>

            <p className="mt-4 text-[13px] leading-relaxed text-subtle">{c.bio}</p>

            <Button variant={following ? 'outline' : 'primary'} className="mt-4 w-full py-3" disabled={followBusy} onClick={toggleFollow}>
              <Heart size={16} className={following ? '' : 'fill-white'} /> {following ? 'Following' : 'Follow'}
            </Button>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <Button variant="outline" size="sm" className="py-2.5" onClick={startChat}>
                <MessageSquare size={15} /> Chat
              </Button>
              <Button variant="outline" size="sm" className="py-2.5" onClick={() => setGift(true)}>
                <Gift size={15} /> Gift
              </Button>
              <Button size="sm" className="py-2.5" onClick={() => setCall(true)}>
                <Video size={15} /> Call
              </Button>
            </div>

            <button
              onClick={() => setMenu(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2 text-[13px] font-medium text-subtle hover:bg-gray-50 dark:hover:bg-white/5"
            >
              <MoreHorizontal size={16} /> More options
            </button>
          </Card>
        </div>

        {/* Right content */}
        <div>
          <Segmented options={['Details', 'Gallery']} value={tab} onChange={setTab} />
          {tab === 'Details' ? (
            <div className="mt-4 space-y-4">
              <InfoCard title="Talks about">
                <div className="flex flex-wrap gap-2">
                  {(c.talksAboutTags || []).map((t) => (
                    <span key={t} className="rounded-full bg-brand-50 px-3 py-1.5 text-[13px] font-medium text-brand dark:bg-brand/15">{t}</span>
                  ))}
                  {c.talksAboutTags?.length === 0 && <p className="text-[13px] text-subtle">Nothing added yet</p>}
                </div>
              </InfoCard>
              <InfoCard title="Hobbies">
                <ul className="grid gap-1.5 text-[14px] text-ink sm:grid-cols-2">
                  {(c.hobbies || []).map((h) => <li key={h} className="flex gap-2"><span className="text-brand">•</span>{h}</li>)}
                </ul>
              </InfoCard>
              <InfoCard title="Sports">
                <div className="flex flex-wrap gap-2">
                  {(c.sports || []).map((s) => (
                    <span key={s} className="rounded-full bg-gold-soft px-3 py-1.5 text-[13px] font-medium text-gold dark:bg-gold/15">{s}</span>
                  ))}
                </div>
              </InfoCard>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(galleryItems.length ? galleryItems : Array.from({ length: c.galleryCount || 6 })).map((item, i) => {
                const [a, b] = MEDIA_G[i % MEDIA_G.length]
                return (
                  <button
                    key={item?.id ?? i}
                    type="button"
                    onClick={() => (item?.url ? setViewerIndex(i) : toast("This photo isn't available yet"))}
                    className="block w-full text-left"
                  >
                    <GradientBox from={a} to={b} seed={i} className="aspect-square rounded-xl">
                      {item?.url && item.type !== 'video' ? (
                        <img src={item.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <span className="absolute inset-0 grid place-items-center text-white/90"><Play size={22} className="fill-white" /></span>
                      )}
                    </GradientBox>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <CallModal creator={call ? c : null} onClose={() => setCall(false)} onStart={(mode) => { setCall(false); nav(`/call/${c.id}?mode=${mode}`) }} />

      <Modal open={menu} onClose={() => setMenu(false)} title="More options">
        <div className="divide-y divide-line">
          <MenuRow icon={<EyeOff size={18} className="text-brand" />} title="Hide" sub="Hide this profile from Home" onClick={() => { setMenu(false); toast(`${c.name} hidden`) }} />
          <MenuRow icon={<Flag size={18} className="text-gold" />} title="Report creator" sub="Report inappropriate behaviour" onClick={() => { setMenu(false); nav(`/report/${c.id}`) }} />
          <MenuRow icon={<Ban size={18} className="text-rose-500" />} title="Block creator" sub="You will no longer be matched" onClick={() => { setMenu(false); nav(`/block/${c.id}`) }} />
        </div>
      </Modal>

      {gift && (
        <GiftPicker
          balance={state.wallet?.balancePaise ?? 0}
          onClose={() => setGift(false)}
          onSend={sendGift}
        />
      )}

      {viewerIndex !== null && (
        <GalleryViewer items={galleryItems} index={viewerIndex} onIndexChange={setViewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </div>
  )
}

// Swipeable full-screen photo/video viewer — native horizontal scroll-snap
// rather than custom drag-tracking, so touch swipe works for free and there's
// nothing to fight the browser's own momentum/rubber-banding over. Arrow
// buttons + dot indicators cover mouse/desktop use of the same gesture.
function GalleryViewer({ items, index, onIndexChange, onClose }) {
  const scrollRef = useRef(null)
  const suppressScrollRef = useRef(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    suppressScrollRef.current = true
    el.scrollTo({ left: index * el.clientWidth, behavior: 'instant' })
    // Let the programmatic scroll settle before onScroll starts reacting to it.
    const t = setTimeout(() => { suppressScrollRef.current = false }, 50)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goTo = (i) => {
    const el = scrollRef.current
    if (!el || i < 0 || i >= items.length) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  const onScroll = () => {
    if (suppressScrollRef.current) return
    const el = scrollRef.current
    if (!el) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== index) onIndexChange(i)
  }

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-black/95" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex items-center justify-between p-4 text-white">
        <span className="text-[13px] font-medium">{index + 1} / {items.length}</span>
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white/10"><X size={18} /></button>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="thin-scroll flex flex-1 snap-x snap-mandatory overflow-x-auto">
        {items.map((item) => (
          <div key={item.id} className="flex h-full w-full shrink-0 snap-center items-center justify-center p-4">
            {item.type === 'video' ? (
              <video src={item.url} controls className="max-h-full max-w-full rounded-lg" />
            ) : (
              <img src={item.url} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
            )}
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <>
          {index > 0 && (
            <button onClick={() => goTo(index - 1)} className="absolute left-2 top-1/2 hidden -translate-y-1/2 place-items-center rounded-full bg-white/10 p-2 text-white sm:grid">
              <ChevronLeft size={22} />
            </button>
          )}
          {index < items.length - 1 && (
            <button onClick={() => goTo(index + 1)} className="absolute right-2 top-1/2 hidden -translate-y-1/2 place-items-center rounded-full bg-white/10 p-2 text-white sm:grid">
              <ChevronRight size={22} />
            </button>
          )}
          <div className="flex items-center justify-center gap-1.5 pb-6">
            {items.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/30'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function InfoCard({ title, children }) {
  return (
    <Card className="p-4">
      <p className="text-[12px] font-bold uppercase tracking-wide text-subtle">{title}</p>
      <div className="mt-3">{children}</div>
    </Card>
  )
}

function MenuRow({ icon, title, sub, onClick }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 py-3.5 text-left">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-gray-100 dark:bg-white/10">{icon}</span>
      <span>
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        <span className="block text-[13px] text-subtle">{sub}</span>
      </span>
    </button>
  )
}
