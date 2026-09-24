import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, Video, Image as ImageIcon, Users, Coins, RotateCw } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Avatar, GradientBox, Chip, EmptyState, Button, Modal, Skeleton } from '../components/ui'
import { hostsApi, meApi, ApiError } from '../lib/api'
import { normalizeHostList } from '../lib/normalize'
import { userName } from '../lib/format'

const TABS = ['All', 'New', 'Popular', 'Following']
const CARD_G = [
  ['#8f7fe0', '#5b28d6'], ['#a99be8', '#6a4fd0'], ['#e6b980', '#c9822b'],
  ['#7fd6a8', '#3f9878'], ['#d68f9b', '#9b3f5f'], ['#8fb0e8', '#4a6bb0'],
]

// Small in-memory cache so switching tabs doesn't re-fetch the same host's
// gallery every time the grid remounts.
const galleryCache = new Map()
function useHostGallery(hostId) {
  const [photos, setPhotos] = useState(() => galleryCache.get(hostId) ?? null)
  useEffect(() => {
    if (galleryCache.has(hostId)) {
      setPhotos(galleryCache.get(hostId))
      return
    }
    let alive = true
    hostsApi.gallery(hostId)
      .then((res) => {
        const items = (res.items || []).filter((it) => it.mediaType === 'photo' && it.url)
        galleryCache.set(hostId, items)
        if (alive) setPhotos(items)
      })
      .catch(() => {
        if (alive) setPhotos([])
      })
    return () => { alive = false }
  }, [hostId])
  return photos
}

async function fetchTab(tab) {
  if (tab === 'Following') {
    const res = await meApi.following()
    return normalizeHostList(res.hosts ? res : { hosts: res.following || res })
  }
  const sort = tab === 'Popular' ? 'rating_desc' : undefined
  const res = await hostsApi.list({ page: 1, pageSize: 24, sort })
  return normalizeHostList(res)
}

export default function Home() {
  const { state } = useApp()
  const [tab, setTab] = useState('All')
  const [hosts, setHosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const nav = useNavigate()
  const [callFor, setCallFor] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    fetchTab(tab)
      .then((list) => alive && setHosts(list))
      .catch((err) => alive && setError(err instanceof ApiError ? err.message : 'Could not load creators'))
      .finally(() => alive && setLoading(false))

    // There's no realtime "host came online" push from the backend yet, so
    // sitting on Home never otherwise learns about it. Poll quietly in the
    // background (no skeleton/error flicker) so newly-online hosts and
    // status changes show up without navigating away and back.
    const iv = setInterval(() => {
      fetchTab(tab).then((list) => alive && setHosts(list)).catch(() => {})
    }, 15000)

    return () => { alive = false; clearInterval(iv) }
  }, [tab])

  const list = useMemo(
    () => hosts.filter((c) => !state.blocked.some((b) => b.id === c.id)),
    [hosts, state.blocked],
  )

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-ink">
            Hello, {userName(state.user)} 👋
          </h1>
          <p className="mt-0.5 text-[13px] text-subtle">Discover creators and start real conversations</p>
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {TABS.map((t) => <Chip key={t} active={tab === t} onClick={() => setTab(t)}>{t}</Chip>)}
        </div>
      </div>

      {loading ? (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="aspect-[4/5] w-full" />
              <Skeleton className="mt-2 h-4 w-2/3" />
              <Skeleton className="mt-1.5 h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : error ? (
        <EmptyState icon={<RotateCw size={26} />} tone="rose" title="Could not load creators" text={error}>
          <Button onClick={() => setTab((t) => t)}>Retry</Button>
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Users size={28} />}
          title={tab === 'Following' ? "You're not following anyone yet" : 'No creators to show'}
          text="Explore creators on the All tab. Followed creators show up here, with a LIVE tag when they go live."
        >
          <Button onClick={() => setTab('All')}>Go to All</Button>
        </EmptyState>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {list.map((c, i) => (
            <CreatorCard key={c.id} c={c} seed={i} onCall={() => setCallFor(c)} />
          ))}
        </div>
      )}

      <CallModal creator={callFor} onClose={() => setCallFor(null)} onStart={(mode) => {
        setCallFor(null)
        nav(`/call/${callFor.id}?mode=${mode}`)
      }} />
    </div>
  )
}

export function CreatorCard({ c, seed = 0, onCall }) {
  const nav = useNavigate()
  const [from, to] = CARD_G[seed % CARD_G.length]
  return (
    <div className="group">
      <button onClick={() => nav(`/creator/${c.id}`)} className="block w-full text-left">
        <CardMedia c={c} from={from} to={to} seed={seed} />
      </button>
      <button
        onClick={onCall}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2 text-[13px] font-semibold text-white opacity-90 transition group-hover:opacity-100"
      >
        <Video size={15} /> Call {c.name}
      </button>
    </div>
  )
}

function CardMedia({ c, from, to, seed }) {
  const photos = useHostGallery(c.id)
  const [idx, setIdx] = useState(0)
  const scrollRef = useRef(null)

  const onScroll = (e) => {
    const el = e.currentTarget
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== idx) setIdx(i)
  }

  const hasPhotos = photos && photos.length > 0

  // Auto-advance the carousel every 3s; the timer restarts on every index
  // change (auto or manual swipe), so a manual swipe just resets the clock
  // instead of fighting it.
  useEffect(() => {
    if (!hasPhotos || photos.length < 2) return
    const timer = setInterval(() => {
      const el = scrollRef.current
      if (!el) return
      const next = (idx + 1) % photos.length
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
    }, 3000)
    return () => clearInterval(timer)
  }, [hasPhotos, photos, idx])

  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-gray-100 dark:bg-white/5">
      {hasPhotos ? (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="thin-scroll flex h-full w-full snap-x snap-mandatory overflow-x-auto"
        >
          {photos.map((p) => (
            <img
              key={p.id}
              src={p.url}
              alt=""
              draggable={false}
              className="h-full w-full shrink-0 snap-center object-cover"
            />
          ))}
        </div>
      ) : (
        <GradientBox from={from} to={to} seed={seed} className="h-full w-full">
          <div className="absolute inset-0 grid place-items-center">
            <Avatar id={c.id} photoUrl={c.avatarUrl} size={56} />
          </div>
        </GradientBox>
      )}

      {hasPhotos && photos.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center gap-1">
          {photos.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all ${i === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`}
            />
          ))}
        </div>
      )}

      {c.live && (
        <span className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1 rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-white" /> Live
        </span>
      )}
      <span className={`pointer-events-none absolute right-2.5 top-2.5 h-3 w-3 rounded-full border-2 border-white ${c.online ? 'bg-green-400' : 'bg-gray-400'}`} />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3">
        <div className="flex items-center gap-1.5">
          <Avatar id={c.id} photoUrl={c.avatarUrl} size={20} />
          <span className="truncate text-[14px] font-semibold text-white">{c.name}</span>
        </div>
        <div className="mt-1 flex items-center gap-2.5 text-[11px] text-white/90">
          <span className="flex items-center gap-1 text-gold"><Coins size={11} /> ₹{Math.round(c.ratePaise / 100)}/min</span>
          <span className="flex items-center gap-1"><ImageIcon size={11} /> {c.galleryCount}</span>
        </div>
      </div>
    </div>
  )
}

export function CallModal({ creator, onClose, onStart }) {
  if (!creator) return null
  return (
    <Modal open onClose={onClose} title={`Call ${creator.name}`}>
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1 py-3" onClick={() => onStart('voice')}>
          <Phone size={16} /> Audio Call
        </Button>
        <Button className="flex-1 py-3" onClick={() => onStart('video')}>
          <Video size={16} /> Video Call
        </Button>
      </div>
      <p className="mt-3 rounded-xl bg-brand-50 p-3 text-[12px] leading-relaxed text-brand dark:bg-brand/15">
        🛡️ Calls are billed at ₹{Math.round((creator.ratePaise || 0) / 100)}/min and may be reviewed for safety.
      </p>
    </Modal>
  )
}
