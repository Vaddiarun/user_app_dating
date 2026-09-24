import { useNavigate } from 'react-router-dom'
import {
  User, UserX, Receipt, Wallet, TrendingUp, Crown, BadgeCheck, Globe,
  Bell, Info, HelpCircle, UserMinus, LogOut, ChevronRight,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Avatar, Card } from '../components/ui'
import { rupees, userName, userHandle } from '../lib/format'

export default function Profile() {
  const { state } = useApp()
  const nav = useNavigate()
  const u = state.user || {}
  const chatMin = state.wallet ? Math.floor((state.wallet.balancePaise || 0) / 100) : 0

  const groups = [
    {
      title: 'Account',
      rows: [
        { icon: <User size={17} />, t: 'Edit Profile', s: 'Name, username, email', to: '/settings/edit-profile' },
        { icon: <UserX size={17} className="text-rose-500" />, t: 'Blocked creators', s: `${state.blocked.length} accounts`, to: '/settings/blocked' },
        { icon: <Receipt size={17} />, t: 'Talktime Transactions', s: 'Recharges and payments', to: '/settings/transactions' },
        { icon: <Wallet size={17} />, t: 'Talktime', s: 'Available balance', right: state.wallet && <span className="text-[13px] font-bold text-gold">₹{rupees(state.wallet.balancePaise)}</span>, to: '/settings/talktime' },
        { icon: <TrendingUp size={17} />, t: 'Level Up', s: 'Not part of this release', to: '/settings/level' },
        { icon: <Crown size={17} className="text-gold" />, t: 'VIP Subscription', s: u.isVipActive ? 'Active' : 'Unlock priority access', to: '/vip' },
        { icon: <BadgeCheck size={17} />, t: 'Active Subscriptions', s: u.isVipActive ? 'View' : 'None', to: '/settings/subscriptions' },
        { icon: <Globe size={17} />, t: 'Languages', s: (u.languages || []).join(', ') || 'Not set', to: '/settings/languages' },
      ],
    },
    {
      title: 'Preferences',
      rows: [{ icon: <Bell size={17} />, t: 'Notifications', s: 'Live alerts, messages', to: '/settings/notifications' }],
    },
    {
      title: 'Support & about',
      rows: [
        { icon: <Info size={17} />, t: 'About Us', to: '/settings/about' },
        { icon: <HelpCircle size={17} />, t: 'Help & support', to: '/settings/support' },
        { icon: <UserMinus size={17} className="text-rose-500" />, t: 'Delete Account', to: '/settings/delete' },
        { icon: <LogOut size={17} className="text-rose-500" />, t: 'Log out', to: '/logout' },
      ],
    },
  ]

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[22px] font-extrabold tracking-tight text-ink">Profile</h1>

      <Card className="mt-4 flex items-center gap-4 p-4">
        <Avatar id={u.id || 'me'} photoUrl={u.avatarUrl} size={60} ring ringColor="#5b28d6" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-bold text-ink">{userName(u)}</span>
            {u.isVipActive && <span className="rounded-full bg-gold-soft px-1.5 py-0.5 text-[10px] font-bold text-gold dark:bg-gold/15">👑 VIP</span>}
          </div>
          {u.username && <p className="text-[12px] font-medium text-brand">@{u.username}</p>}
          <p className="text-[12px] text-subtle">{u.phone}</p>
          {u.ageVerified && (
            <div className="mt-1 flex items-center gap-2 text-[11px]">
              <span className="flex items-center gap-1 font-medium text-green-600"><span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Age verified</span>
            </div>
          )}
        </div>
        <button onClick={() => nav('/settings/edit-profile')} className="rounded-lg border border-brand px-3 py-1.5 text-[12px] font-semibold text-brand">Edit</button>
      </Card>

      {groups.map((g) => (
        <div key={g.title} className="mt-5">
          <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-subtle">{g.title}</p>
          <Card className="divide-y divide-line">
            {g.rows.map((r) => (
              <button
                key={r.t}
                onClick={() => r.to && nav(r.to)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-white/5"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand dark:bg-brand/15">{r.icon}</span>
                <span className="flex-1">
                  <span className="block text-[15px] font-semibold text-ink">{r.t}</span>
                  {r.s && <span className="block text-[12px] text-subtle">{r.s}</span>}
                </span>
                {r.right || <ChevronRight size={17} className="text-subtle" />}
              </button>
            ))}
          </Card>
        </div>
      ))}
    </div>
  )
}
