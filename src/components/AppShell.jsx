import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home, Radio, MessageSquare, Phone, Wallet, Bell, Search, Settings, Menu, X, Moon, Sun, Sparkles,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Avatar } from './ui'
import { beans, userName, userHandle } from '../lib/format'
import { chatApi } from '../lib/api'

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/live', label: 'Live', icon: Radio },
  { to: '/chat', label: 'Chat', icon: MessageSquare, badgeKey: 'chat' },
  { to: '/calls', label: 'Calls', icon: Phone },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
]

function useChatBadge() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    const load = () => {
      chatApi.conversations()
        .then((res) => {
          if (!alive) return
          const list = res.conversations || res.items || res || []
          setCount(list.reduce((n, c) => n + (c.unreadCount ?? c.unread ?? 0), 0))
        })
        .catch(() => {})
    }
    load()
    const iv = setInterval(load, 15000)
    return () => { alive = false; clearInterval(iv) }
  }, [])
  return count
}

export default function AppShell({ children }) {
  const [open, setOpen] = useState(false)
  const { state } = useApp()
  const chatBadge = useChatBadge()
  const notifBadge = state.notifications.filter((n) => !n.read).length
  const nav = useNavigate()

  const toggleTheme = () => {
    const dark = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('vibe-theme', dark ? 'dark' : 'light') } catch {}
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1400px]">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-card px-3 py-5 lg:flex">
        <Brand />
        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {NAV.map((n) => (
            <SideLink key={n.to} {...n} badge={n.badgeKey ? chatBadge : 0} />
          ))}
          <div className="my-3 h-px bg-line" />
          <SideLink to="/vip" label="VIP" icon={Sparkles} />
          <SideLink to="/profile" label="Settings" icon={Settings} />
        </nav>
        <div className="mt-auto pt-3">
          <button
            onClick={() => nav('/profile')}
            className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-gray-100 dark:hover:bg-white/5 transition group"
            title="Go to Profile"
          >
            <Avatar id={state.user?.id || 'me'} size={38} ring ringColor="#5b28d6" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-ink group-hover:text-brand">{userName(state.user)}</p>
              <p className="truncate text-[11px] text-subtle">{userHandle(state.user) || 'View profile'}</p>
            </div>
          </button>
          <div className="my-2 h-px bg-line" />
          <ThemeButton onClick={toggleTheme} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-64 flex-col bg-card p-4">
            <div className="flex items-center justify-between">
              <Brand />
              <button onClick={() => setOpen(false)}><X size={20} /></button>
            </div>
            <nav className="mt-6 flex flex-1 flex-col gap-1" onClick={() => setOpen(false)}>
              {NAV.map((n) => <SideLink key={n.to} {...n} badge={n.badgeKey ? chatBadge : 0} />)}
              <div className="my-3 h-px bg-line" />
              <SideLink to="/vip" label="VIP" icon={Sparkles} />
              <SideLink to="/profile" label="Settings" icon={Settings} />
            </nav>
            <div className="mt-auto pt-3">
              <button
                onClick={() => { setOpen(false); nav('/profile') }}
                className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-gray-100 dark:hover:bg-white/5 transition group"
              >
                <Avatar id={state.user?.id || 'me'} size={38} ring ringColor="#5b28d6" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-ink group-hover:text-brand">{userName(state.user)}</p>
                  <p className="truncate text-[11px] text-subtle">{userHandle(state.user) || 'View profile'}</p>
                </div>
              </button>
              <div className="my-2 h-px bg-line" />
              <ThemeButton onClick={toggleTheme} />
            </div>
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-card/80 px-4 py-3 backdrop-blur md:px-6">
          <button className="lg:hidden" onClick={() => setOpen(true)}><Menu size={22} /></button>
          <button
            onClick={() => nav('/search')}
            className="flex min-w-0 flex-1 items-center gap-2 truncate rounded-xl border border-line bg-canvas px-3 py-2 text-left text-[13px] text-subtle hover:border-brand-200 md:max-w-sm md:flex-none md:w-80"
          >
            <Search size={16} className="shrink-0" />
            <span className="truncate">Search creators by name or language</span>
          </button>
          <div className="hidden flex-1 md:block" />
          <button
            onClick={() => nav('/wallet')}
            className="flex items-center gap-1.5 rounded-xl border border-line px-2.5 py-2 text-[13px] font-bold text-gold hover:bg-gray-50 dark:hover:bg-white/5"
          >
            <Wallet size={15} /> {state.wallet ? beans(state.wallet.displayBeans) : '—'}
          </button>
          <button
            onClick={() => nav('/notifications')}
            className="relative rounded-xl border border-line p-2 hover:bg-gray-50 dark:hover:bg-white/5"
          >
            <Bell size={18} />
            {notifBadge > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {notifBadge}
              </span>
            )}
          </button>
          <button
            onClick={() => nav('/profile')}
            className="flex items-center gap-2 rounded-xl border border-line bg-canvas/60 px-2 py-1.5 hover:border-brand-200 hover:bg-gray-50 dark:hover:bg-white/5 transition group"
            title="View profile"
          >
            <Avatar id={state.user?.id || 'me'} size={32} ring ringColor="#5b28d6" />
            <div className="hidden sm:flex flex-col text-left pr-1">
              <span className="text-[13px] font-bold text-ink leading-tight truncate max-w-[120px] group-hover:text-brand">
                {userName(state.user)}
              </span>
              <span className="text-[11px] text-subtle leading-tight">
                {userHandle(state.user) || 'Profile'}
              </span>
            </div>
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-x-hidden px-4 py-5 pb-24 md:px-6 lg:pb-8">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-line bg-card lg:hidden">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-brand' : 'text-subtle'}`
              }
            >
              <span className="relative">
                <n.icon size={20} />
                {n.badgeKey && chatBadge > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">
                    {chatBadge}
                  </span>
                )}
              </span>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}

function Brand() {
  return (
    <NavLink to="/" className="flex items-center gap-2 px-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">
        <Sparkles size={16} />
      </span>
      <span className="text-[16px] font-extrabold tracking-tight text-ink">Vibe</span>
    </NavLink>
  )
}

function ThemeButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium text-subtle hover:bg-gray-100 dark:hover:bg-white/5"
    >
      <Moon size={18} className="hidden dark:block" />
      <Sun size={18} className="dark:hidden" />
      Theme
    </button>
  )
}

function SideLink({ to, label, icon: Icon, end, badge = 0 }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-semibold transition ${
          isActive ? 'bg-brand-50 text-brand dark:bg-brand/15' : 'text-subtle hover:bg-gray-100 hover:text-ink dark:hover:bg-white/5'
        }`
      }
    >
      <Icon size={18} />
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
          {badge}
        </span>
      )}
    </NavLink>
  )
}
