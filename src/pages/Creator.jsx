import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  BadgeCheck, Heart, MessageSquare, Gift, Video, Play, MoreHorizontal, EyeOff, Flag, Ban, Users, Loader2, RotateCw,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Avatar, GradientBox, Button, Card, Segmented, Modal, EmptyState } from '../components/ui'
import { compact } from '../lib/format'
import { CallModal } from './Home'
import GiftPicker from '../components/GiftPicker'
import { hostsApi, giftsApi, ApiError } from '../lib/api'
import { normalizeHost } from '../lib/normalize'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('Details')
  const [menu, setMenu] = useState(false)
  const [call, setCall] = useState(false)
  const [gift, setGift] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)

  const load = () => {
    setLoading(true)
    setError('')
    hostsApi.get(id)
      .then((res) => setC(normalizeHost(res)))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this creator'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id]) // eslint-disable-line

  if (loading) return <div className="grid place-items-center py-24"><Loader2 size={26} className="animate-spin text-subtle" /></div>
  if (error || !c) {
    return (
      <EmptyState icon={<RotateCw size={26} />} tone="rose" title="Creator not found" text={error || 'This profile may have been removed.'}>
        <Button onClick={load}>Retry</Button>
      </EmptyState>
    )
  }

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
              <Avatar id={c.id} size={72} ring ringColor={c.online ? '#2fb37a' : '#c9c9d2'} />
              <div className="min-w-0 pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[19px] font-bold text-ink">{c.name}</span>
                  {c.verified && <BadgeCheck size={16} className="text-brand" />}
                </div>
                <p className="text-[13px] text-subtle">{c.languages?.join(', ')}{c.age ? ` · ${c.age} yrs` : ''}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                  <span className={`flex items-center gap-1 font-medium ${c.online ? 'text-green-600' : 'text-subtle'}`}>
                    <span className={`h-2 w-2 rounded-full ${c.online ? 'bg-green-500' : 'bg-gray-400'}`} /> {c.online ? 'Online' : 'Offline'}
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
              {(c.gallery?.length ? c.gallery : Array.from({ length: c.galleryCount || 6 })).map((item, i) => {
                const [a, b] = MEDIA_G[i % MEDIA_G.length]
                return (
                  <GradientBox key={i} from={a} to={b} seed={i} className="aspect-square rounded-xl">
                    <span className="absolute inset-0 grid place-items-center text-white/90"><Play size={22} className="fill-white" /></span>
                  </GradientBox>
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
