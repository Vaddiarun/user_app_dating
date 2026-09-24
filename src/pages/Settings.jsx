import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Check, ShieldCheck, BadgeCheck, Crown, Globe, Video, Radio, MessageSquare,
  FileText, HelpCircle, Flag, Trash2, CreditCard, Percent, Headphones, ChevronRight, Loader2, Star, Camera,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Avatar, Button, Card, Toggle, EmptyState } from '../components/ui'
import { beans, userName, userHandle } from '../lib/format'
import {
  meApi, vipApi, walletApi, grievanceApi, uploadToS3, ApiError,
} from '../lib/api'

function Sub({ title, subtitle, children }) {
  const nav = useNavigate()
  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => nav('/profile')} className="mb-3 flex items-center gap-1 text-[13px] font-medium text-subtle hover:text-ink">
        <ChevronLeft size={16} /> Settings
      </button>
      <h1 className="text-[21px] font-extrabold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-0.5 text-[13px] text-subtle">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

/* ---- Edit profile ---- */
export function EditProfile() {
  const { state, actions, toast } = useApp()
  const u = state.user || {}
  const [name, setName] = useState(u.name || '')
  const [username, setUsername] = useState(u.username || '')
  const [email, setEmail] = useState(u.email || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const fileInputRef = useRef(null)

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const cleanName = name.trim()
      const cleanUsername = username.trim()
      const cleanEmail = email.trim()
      await meApi.update({ name: cleanName, username: cleanUsername, email: cleanEmail })
      actions.patchUserLocal({ name: cleanName, username: cleanUsername, email: cleanEmail })
      await actions.refreshUser()
      toast('Profile saved')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save changes')
    } finally {
      setBusy(false)
    }
  }

  const pickAvatar = () => fileInputRef.current?.click()

  const uploadAvatar = async (file) => {
    if (!file) return
    // The backend's presigned-URL endpoint only accepts these two exact
    // content types — anything else (webp, heic, gif...) is rejected before
    // ever reaching S3.
    const contentType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    setAvatarUploading(true)
    try {
      const { uploadUrl, url } = await meApi.avatarUploadUrl(contentType)
      await uploadToS3(uploadUrl, file, contentType)
      await meApi.update({ avatarUrl: url })
      actions.patchUserLocal({ avatarUrl: url })
      await actions.refreshUser()
      toast('Profile photo updated')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update photo', { tone: 'error' })
    } finally {
      setAvatarUploading(false)
    }
  }

  return (
    <Sub title="Edit Profile">
      <div className="flex flex-col items-center">
        <button type="button" onClick={pickAvatar} disabled={avatarUploading} className="relative" title="Change profile photo">
          <Avatar id={u.id || 'me'} photoUrl={u.avatarUrl} size={88} ring ringColor="#5b28d6" />
          <span className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full border-2 border-card bg-brand text-white">
            {avatarUploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; uploadAvatar(f) }}
        />
        <h2 className="mt-2.5 text-[18px] font-bold text-ink">{userName({ ...u, name, username })}</h2>
        {(username || u.username) && (
          <p className="text-[13px] font-medium text-brand">@{username || u.username}</p>
        )}
        <p className="mt-0.5 text-[12px] text-subtle">User ID: {u.id || '—'}</p>
      </div>
      <div className="mt-5 space-y-4">
        <Field label="Full Name" value={name} onChange={setName} />
        <Field label="Username" value={username} onChange={setUsername} />
        <Field label="Email" value={email} onChange={setEmail} />
        <Field label="Mobile number" value={u.phone || ''} readOnly check />
        <Field label="Date of birth" value={u.dob || ''} readOnly />
      </div>
      {u.ageVerified && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-green-50 p-3 dark:bg-green-500/15">
          <ShieldCheck size={16} className="mt-0.5 text-green-600" />
          <div>
            <p className="text-[13px] font-semibold text-green-700 dark:text-green-400">Eligibility verified</p>
            <p className="text-[12px] text-green-700/80 dark:text-green-400/70">Confirmed from your date of birth</p>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-[13px] font-medium text-rose-500">{error}</p>}
      <Button className="mt-5 w-full py-3" disabled={busy} onClick={save}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : null} Save changes
      </Button>
    </Sub>
  )
}

function Field({ label, value, onChange, readOnly, check }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-semibold text-ink">{label}</span>
      <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-canvas px-4 py-3">
        <input
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={readOnly}
          className="flex-1 bg-transparent text-[15px] text-ink outline-none"
        />
        {check && <Check size={16} className="text-green-600" />}
      </span>
    </label>
  )
}

/* ---- Blocked creators ---- */
export function BlockedCreators() {
  const { state, actions, toast } = useApp()
  if (state.blocked.length === 0) {
    return (
      <Sub title="Blocked creators">
        <EmptyState tone="green" icon={<Check size={24} />} title="You haven't blocked anyone" text="Anyone you block from a profile, chat or call will be listed here." />
      </Sub>
    )
  }
  return (
    <Sub title="Blocked creators" subtitle={`${state.blocked.length} accounts`}>
      <Card className="divide-y divide-line">
        {state.blocked.map((b) => (
          <div key={b.id} className="flex items-center gap-3 px-4 py-3.5">
            <Avatar id={b.id} size={42} />
            <div className="flex-1">
              <p className="text-[15px] font-semibold text-ink">{b.name}</p>
            </div>
            <Button variant="outline" size="sm" onClick={async () => {
              try { await actions.unblock(b.id); toast(`${b.name} unblocked`) } catch { toast('Could not unblock', { tone: 'error' }) }
            }}>
              Unblock
            </Button>
          </div>
        ))}
      </Card>
      <p className="mt-3 rounded-xl bg-brand-50 p-3 text-[12px] leading-relaxed text-brand dark:bg-brand/15">
        Unblocking allows this account to message and call you again.
      </p>
    </Sub>
  )
}

/* ---- Talktime transactions ---- */
export function Transactions() {
  return (
    <Sub title="Talktime Transactions" subtitle="Recharges and payments">
      <EmptyState
        tone="slate"
        icon={<CreditCard size={24} />}
        title="No transaction history yet"
        text="Individual recharges can be tracked by their transaction ID right after you complete one from Add Balance."
      />
    </Sub>
  )
}

/* ---- Talktime recharge ---- */
export function Talktime() {
  const { state } = useApp()
  const nav = useNavigate()
  const [packages, setPackages] = useState([])
  useEffect(() => { walletApi.packages().then((res) => setPackages(res.packages || [])).catch(() => {}) }, [])

  return (
    <Sub title="Talktime">
      <div>
        <p className="text-[13px] text-subtle">Available Talktime</p>
        <p className="text-[26px] font-extrabold text-gold">{state.wallet ? beans(state.wallet.displayBeans) : '—'}</p>
      </div>

      {!state.user?.isVipActive && (
        <div className="mt-4 rounded-2xl p-4 text-white" style={{ background: 'linear-gradient(135deg,#6a3fd0,#8a5fe0)' }}>
          <p className="flex items-center gap-1.5 text-[15px] font-bold text-gold">👑 Subscribe Now</p>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {['VIP Rate — discount on all calls', 'VIP Access — unlimited live and chats', 'VIP Chats — priority messages'].map((x) => (
              <li key={x} className="flex items-center gap-2"><Check size={13} /> {x}</li>
            ))}
          </ul>
          <button onClick={() => nav('/vip')} className="mt-3 w-full rounded-xl bg-gold py-2.5 text-[14px] font-bold text-ink">See VIP plans</button>
        </div>
      )}

      <p className="mt-5 text-[12px] font-bold uppercase tracking-wide text-subtle">Talktime recharge</p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {packages.map((p) => (
          <button key={p.id} onClick={() => nav(`/add-balance?pkg=${p.id}`)} className="rounded-xl border border-line p-3 text-center hover:border-brand-200">
            <p className="text-[14px] font-bold text-ink">{beans(p.beans ?? p.displayBeans ?? 0)}</p>
            <p className="mt-1 rounded-md bg-brand py-1 text-[12px] font-bold text-white">Pay ₹{((p.pricePaise ?? p.price ?? 0) / 100) || p.amount}</p>
          </button>
        ))}
      </div>
      <button onClick={() => nav('/settings/transactions')} className="mt-4 flex w-full items-center gap-3 rounded-xl border border-line p-3 text-[14px] font-semibold text-ink">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand dark:bg-brand/15">🧾</span> Talktime Transactions
        <ChevronRight size={16} className="ml-auto text-subtle" />
      </button>
    </Sub>
  )
}

/* ---- Level up ---- */
export function LevelUp() {
  return (
    <Sub title="Level Up">
      <EmptyState
        tone="slate"
        icon={<Star size={24} />}
        title="Not part of this release"
        text="Loyalty tiers aren't in scope for the current build — there's no economics or backend behind this screen yet."
      />
    </Sub>
  )
}

/* ---- VIP ---- */
export function Vip() {
  const { state, actions, toast } = useApp()
  const nav = useNavigate()
  const [plans, setPlans] = useState(null)
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState(false)
  const benefits = [
    [<Percent size={16} />, 'VIP Rate', 'Discount on all audio and video calls'],
    [<Radio size={16} />, 'VIP Access', 'Unlimited live streams and chats'],
    [<BadgeCheck size={16} />, 'VIP Badge', 'Your profile is recommended to creators'],
    [<MessageSquare size={16} />, 'VIP Chats', 'Your messages are given priority'],
    [<Headphones size={16} />, 'VIP Care', 'Priority customer support access'],
  ]

  useEffect(() => {
    vipApi.plans().then((res) => {
      const list = res.plans || []
      setPlans(list)
      setPlan(list.find((p) => p.name === '3 Months') || list[0] || null)
    }).catch(() => setPlans([]))
  }, [])

  const subscribe = async () => {
    if (!plan) return
    setBusy(true)
    try {
      await vipApi.subscribe(plan.id)
      await actions.refreshUser()
      toast('Welcome to VIP 👑')
      nav('/profile')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not subscribe', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => nav(-1)} className="mb-3 flex items-center gap-1 text-[13px] font-medium text-subtle hover:text-ink">
        <ChevronLeft size={16} /> Back
      </button>
      <div className="rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg,#6a3fd0,#9a6fe6)' }}>
        <p className="flex items-center gap-1.5 text-[17px] font-bold">👑 {state.user?.isVipActive ? 'You are a VIP' : 'Unlock Your VIP Experience'}</p>
        <p className="mt-1.5 text-[13px] text-white/85">Better rates, unlimited access and priority everywhere on Vibe.</p>
      </div>
      <p className="mt-5 text-[12px] font-bold uppercase tracking-wide text-subtle">VIP benefits</p>
      <Card className="mt-1 divide-y divide-line">
        {benefits.map((b, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold-soft text-gold dark:bg-gold/15">{b[0]}</span>
            <div><p className="text-[14px] font-semibold text-ink">{b[1]}</p><p className="text-[12px] text-subtle">{b[2]}</p></div>
          </div>
        ))}
      </Card>
      <p className="mt-5 text-[12px] font-bold uppercase tracking-wide text-subtle">Choose a plan</p>
      {plans === null ? (
        <div className="mt-3 grid place-items-center py-6"><Loader2 size={22} className="animate-spin text-subtle" /></div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-3">
          {plans.map((p) => (
            <button key={p.id} onClick={() => setPlan(p)} className={`relative rounded-2xl border p-4 text-center ${plan?.id === p.id ? 'border-2 border-brand bg-brand-50 dark:bg-brand/15' : 'border-line'}`}>
              {p.name === '3 Months' && <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-brand px-2 py-0.5 text-[9px] font-bold text-white">BEST VALUE</span>}
              <p className="text-[14px] font-bold text-ink">{p.name}</p>
              <p className="text-[18px] font-extrabold text-ink">₹{((p.pricePaise ?? p.price ?? 0) / 100) || p.amount}</p>
            </button>
          ))}
        </div>
      )}
      <Button variant="gold" className="mt-5 w-full py-3.5" disabled={!plan || busy} onClick={subscribe}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : '👑'} {state.user?.isVipActive ? 'Extend subscription' : 'Become VIP Now'}
      </Button>
    </div>
  )
}

/* ---- Subscriptions ---- */
export function Subscriptions() {
  const { toast } = useApp()
  const [subs, setSubs] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = () => meApi.subscriptions().then((res) => setSubs(res.subscriptions || res.items || [])).catch(() => setSubs([]))
  useEffect(() => { load() }, [])

  const cancel = async (id) => {
    setBusyId(id)
    try { await vipApi.cancel(id); toast('Subscription set to cancel at period end'); load() }
    catch { toast('Could not cancel subscription', { tone: 'error' }) }
    finally { setBusyId(null) }
  }

  if (subs === null) return <Sub title="Active Subscriptions"><div className="grid place-items-center py-10"><Loader2 size={22} className="animate-spin text-subtle" /></div></Sub>

  return (
    <Sub title="Active Subscriptions" subtitle={`${subs.length} active`}>
      {subs.length === 0 ? (
        <EmptyState icon={<Crown size={24} />} tone="gold" title="No active subscriptions" text="Subscribe to VIP for better rates and unlimited access." />
      ) : (
        <>
          <Card className="divide-y divide-line">
            {subs.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-4">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold-soft text-gold dark:bg-gold/15"><Crown size={18} /></span>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-ink">{s.planName || 'VIP'}</p>
                  <p className="text-[12px] text-subtle">
                    {s.cancelAtPeriodEnd ? 'Cancels' : 'Renews'} {s.expiresAt ? new Date(s.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                  </p>
                </div>
                {s.cancelAtPeriodEnd ? (
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-subtle dark:bg-white/10">Ending</span>
                ) : (
                  <Button variant="outline" size="sm" disabled={busyId === s.id} onClick={() => cancel(s.id)}>
                    {busyId === s.id ? <Loader2 size={14} className="animate-spin" /> : 'Cancel'}
                  </Button>
                )}
              </div>
            ))}
          </Card>
          <p className="mt-3 rounded-xl bg-brand-50 p-3 text-[12px] leading-relaxed text-brand dark:bg-brand/15">
            Cancelling keeps your benefits until the end of the current billing period.
          </p>
        </>
      )}
    </Sub>
  )
}

/* ---- Languages ---- */
export function Languages() {
  const { state, actions, toast } = useApp()
  const all = ['Hindi', 'English', 'Marathi', 'Punjabi', 'Bengali', 'Tamil', 'Telugu']
  const [sel, setSel] = useState(state.user?.languages || [])
  const [busy, setBusy] = useState(false)
  const toggle = (l) => setSel((s) => (s.includes(l) ? s.filter((x) => x !== l) : [...s, l]))

  const save = async () => {
    setBusy(true)
    try {
      await meApi.update({ languages: sel })
      await actions.refreshUser()
      toast('Preferences saved')
    } catch {
      toast('Could not save preferences', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sub title="Languages" subtitle="Used for creator recommendations">
      <Card className="divide-y divide-line">
        {all.map((l) => (
          <button key={l} onClick={() => toggle(l)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand dark:bg-brand/15"><Globe size={17} /></span>
            <span className="flex-1 text-[15px] font-semibold text-ink">{l}</span>
            <span className={`grid h-6 w-6 place-items-center rounded-md border ${sel.includes(l) ? 'border-brand bg-brand text-white' : 'border-gray-300'}`}>
              {sel.includes(l) && <Check size={14} />}
            </span>
          </button>
        ))}
      </Card>
      <Button className="mt-4 w-full py-3" disabled={busy} onClick={save}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : null} Save preferences
      </Button>
    </Sub>
  )
}

/* ---- Notification settings ---- */
export function NotificationSettings() {
  const { state, actions, toast } = useApp()
  const prefs = state.notifPrefs || {}
  const rows = [
    ['liveAlerts', 'Live alerts', 'When a creator you follow goes live'],
    ['messages', 'Messages', 'New chat messages'],
    ['callSummaries', 'Call summaries', 'After each call ends'],
    ['walletActivity', 'Wallet activity', 'Payments and balance updates'],
    ['promotionsAndTips', 'Offers', 'Occasional product updates'],
  ]
  const [saving, setSaving] = useState(null)

  const flip = async (key, value) => {
    setSaving(key)
    try { await actions.updateNotifPrefs({ [key]: value }) }
    catch { toast('Could not save preference', { tone: 'error' }) }
    finally { setSaving(null) }
  }

  return (
    <Sub title="Notifications">
      <Card className="divide-y divide-line">
        {rows.map(([k, t, s]) => (
          <div key={k} className="flex items-center gap-3 px-4 py-4">
            <div className="flex-1">
              <p className="text-[15px] font-semibold text-ink">{t}</p>
              <p className="text-[12px] text-subtle">{s}</p>
            </div>
            {saving === k ? <Loader2 size={18} className="animate-spin text-subtle" /> : <Toggle checked={!!prefs[k]} onChange={(v) => flip(k, v)} />}
          </div>
        ))}
      </Card>
    </Sub>
  )
}

/* ---- About ---- */
export function About() {
  return (
    <Sub title="About Us">
      <div className="flex flex-col items-center text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand text-white text-2xl">✦</span>
        <p className="mt-3 text-[20px] font-bold text-ink">About Vibe</p>
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-subtle">
        Vibe connects people with creators through live video calls, real-time chat, and live broadcasts — genuine connections in the moment, not messages left on read.
      </p>
      <p className="mt-4 text-[12px] font-bold uppercase tracking-wide text-subtle">What we offer</p>
      <Card className="mt-2 divide-y divide-line">
        {[
          [<Video size={16} />, 'Live Video & Audio Calls', 'One-on-one, billed by the minute'],
          [<Radio size={16} />, 'Live Broadcasts', 'Join live sessions, chat, send gifts'],
          [<MessageSquare size={16} />, 'Direct Messaging', "Private chats tied to each creator's profile"],
        ].map((r, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand dark:bg-brand/15">{r[0]}</span>
            <div><p className="text-[14px] font-semibold text-ink">{r[1]}</p><p className="text-[12px] text-subtle">{r[2]}</p></div>
          </div>
        ))}
      </Card>
    </Sub>
  )
}

/* ---- Support ---- */
export function Support() {
  const nav = useNavigate()
  const rows = [
    [<HelpCircle size={17} />, 'FAQs', 'Talktime, calls, safety'],
    [<Flag size={17} />, 'Raise a Grievance', 'Formal complaint about a host', '/settings/grievance'],
    [<ShieldCheck size={17} />, 'Community guidelines', ''],
    [<FileText size={17} />, 'Terms & Policies', '', '/settings/terms'],
  ]
  return (
    <Sub title="Help & support">
      <Card className="divide-y divide-line">
        {rows.map((r, i) => (
          <button key={i} onClick={() => r[3] && nav(r[3])} className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-gray-50 dark:hover:bg-white/5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand dark:bg-brand/15">{r[0]}</span>
            <div className="flex-1">
              <p className="text-[15px] font-semibold text-ink">{r[1]}</p>
              {r[2] && <p className="text-[12px] text-subtle">{r[2]}</p>}
            </div>
            <ChevronRight size={16} className="text-subtle" />
          </button>
        ))}
      </Card>
    </Sub>
  )
}

/* ---- Terms ---- */
export function Terms() {
  const rows = [
    ['Terms of Use', ''],
    ['Privacy Policy', 'How we handle your data'],
    ['Community Guidelines', 'What is not allowed'],
    ['Refund & Payment Policy', ''],
    ['Grievance Redressal Policy', 'Raise a grievance'],
  ]
  return (
    <Sub title="Terms & Policies">
      <Card className="divide-y divide-line">
        {rows.map(([t, s]) => (
          <div key={t} className="flex items-center gap-3 px-4 py-3.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand dark:bg-brand/15"><FileText size={17} /></span>
            <div className="flex-1">
              <p className="text-[14px] font-semibold text-ink">{t}</p>
              {s && <p className="text-[12px] text-subtle">{s}</p>}
            </div>
            <ChevronRight size={16} className="text-subtle" />
          </div>
        ))}
      </Card>
      <p className="mt-3 rounded-xl bg-gray-100 p-3 text-[12px] leading-relaxed text-subtle dark:bg-white/5">
        Grievance Officer response within 15 days.
      </p>
    </Sub>
  )
}

/* ---- Grievance ---- */
const NATURE_OPTIONS = [
  ['nudity_pornography', 'Nudity / Pornography'],
  ['content_objection', 'Objection to Content'],
  ['reinstatement', 'Reinstatement of Account'],
  ['copyright_violation', 'Violation of Copyright / IP'],
  ['privacy', 'Privacy'],
  ['impersonation', 'Impersonation'],
  ['child_safety', 'Child Safety'],
  ['other', 'Other'],
]

export function Grievance() {
  const nav = useNavigate()
  const { state, toast } = useApp()
  const u = state.user || {}
  const [firstName, setFirstName] = useState(u.name?.split(' ')?.[0] || '')
  const [lastName, setLastName] = useState(u.name?.split(' ')?.slice(1).join(' ') || '')
  const [contactNumber, setContactNumber] = useState(u.phone || '')
  const [email, setEmail] = useState(u.email || '')
  const [nature, setNature] = useState('nudity_pornography')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ref, setRef] = useState('')

  if (ref) {
    return (
      <Sub title="Raise a Grievance">
        <EmptyState tone="green" icon={<Check size={24} />} title="Grievance submitted" text={`Reference ${ref}. Our team responds within 15 days.`}>
          <Button onClick={() => nav('/profile')}>Done</Button>
        </EmptyState>
      </Sub>
    )
  }

  const submit = async () => {
    if (!description.trim()) { setError('Describe your complaint'); return }
    setBusy(true)
    setError('')
    try {
      let evidenceKeys = []
      if (file) {
        const { uploadUrl, key } = await grievanceApi.uploadUrl(file.type || 'application/octet-stream')
        await uploadToS3(uploadUrl, file, file.type || 'application/octet-stream')
        evidenceKeys = [key]
      }
      const res = await grievanceApi.submit({
        firstName, lastName, contactNumber, email, natureOfComplaint: nature, description, evidenceKeys,
      })
      setRef(res.id || res.referenceId || 'submitted')
      toast('Grievance submitted')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit grievance')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sub title="Raise a Grievance" subtitle="Formal complaint · reviewed in 15 days">
      <div className="grid grid-cols-2 gap-3">
        <TextField label="First name" value={firstName} onChange={setFirstName} />
        <TextField label="Last name" value={lastName} onChange={setLastName} />
      </div>
      <TextField label="Contact number" value={contactNumber} onChange={setContactNumber} className="mt-3" />
      <TextField label="Email address" value={email} onChange={setEmail} className="mt-3" />
      <p className="mt-5 text-[12px] font-bold uppercase tracking-wide text-subtle">Nature of complaint</p>
      <Card className="mt-2 p-3">
        {NATURE_OPTIONS.map(([k, label]) => (
          <button key={k} onClick={() => setNature(k)} className="flex w-full items-center gap-3 py-2 text-left">
            <span className={`grid h-5 w-5 place-items-center rounded-full border ${nature === k ? 'border-brand bg-brand text-white' : 'border-gray-300'}`}>
              {nature === k && <Check size={12} />}
            </span>
            <span className="text-[14px] text-ink">{label}</span>
          </button>
        ))}
      </Card>
      <label className="mt-4 block text-[13px] font-semibold text-ink">Describe your complaint</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="mt-1.5 w-full rounded-xl border border-line bg-canvas p-3 text-[14px] outline-none"
        placeholder="What happened and what action do you want us to take?"
      />
      <label className="mt-4 block text-[13px] font-semibold text-ink">Evidence (optional)</label>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="mt-1.5 w-full text-[13px] text-subtle" />
      {error && <p className="mt-2 text-[13px] font-medium text-rose-500">{error}</p>}
      <Button className="mt-4 w-full py-3" disabled={busy} onClick={submit}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : null} Submit
      </Button>
    </Sub>
  )
}

function TextField({ label, value, onChange, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[13px] font-semibold text-ink">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-[15px] text-ink outline-none" />
    </label>
  )
}

/* ---- Delete account ---- */
export function DeleteAccount() {
  const nav = useNavigate()
  const { actions, toast } = useApp()
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      await actions.deleteAccount()
      toast('Account deleted')
      nav('/onboarding')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sub title="Delete Account">
      <div className="flex flex-col items-center text-center">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-rose-50 text-rose-500 dark:bg-rose-500/15"><Trash2 size={30} /></span>
        <h2 className="mt-4 text-[18px] font-bold text-ink">Delete your account?</h2>
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-subtle">
          This permanently removes your profile, chats, call history and remaining talktime. This cannot be undone.
        </p>
      </div>
      <Card className="mt-4 space-y-2 p-4 text-[13px] text-ink">
        <p>💳 Remaining talktime is forfeited</p>
        <p>👑 Active subscriptions are cancelled</p>
        <p>💬 Chats and call history are deleted</p>
      </Card>
      <label className="mt-4 block text-[13px] font-semibold text-ink">Type DELETE to confirm</label>
      <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-4 py-3 text-[15px] outline-none" />
      {error && <p className="mt-2 text-[13px] font-medium text-rose-500">{error}</p>}
      <Button
        variant="danger"
        className="mt-4 w-full py-3"
        disabled={confirm !== 'DELETE' || busy}
        onClick={remove}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Delete account
      </Button>
      <Button variant="outline" className="mt-3 w-full py-3" onClick={() => nav('/profile')}>Keep my account</Button>
    </Sub>
  )
}
