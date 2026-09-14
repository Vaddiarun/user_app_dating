import { Routes, Route, Outlet, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import AppShell from './components/AppShell'
import { useApp } from './store/AppStore'
import { ToastHost } from './components/ui'

import Home from './pages/Home'
import Creator from './pages/Creator'
import Search from './pages/Search'
import Chat from './pages/Chat'
import Calls from './pages/Calls'
import CallRoom from './pages/CallRoom'
import Live, { LiveRoom } from './pages/Live'
import Wallet, { AddBalance } from './pages/Wallet'
import Notifications from './pages/Notifications'
import Profile from './pages/Profile'
import {
  EditProfile, BlockedCreators, Transactions, Talktime, LevelUp, Vip, Subscriptions,
  Languages, NotificationSettings, About, Support, Terms, Grievance, DeleteAccount,
} from './pages/Settings'
import { CallEnded, CallSummary, GiftSent, BlockFlow, ReportFlow } from './pages/Outcomes'
import { Splash, Phone, Otp, ProfileSetup, AccessConfirmed, BootScreen } from './pages/Auth'
import { NotFound, Offline, SessionExpired, AccountRestricted, Logout } from './pages/Errors'

function Shell() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.querySelector('main')?.scrollTo?.(0, 0)
    window.scrollTo(0, 0)
  }, [pathname])
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

function RequireAuth() {
  const { state, actions } = useApp()
  if (state.authStatus === 'checking') return <BootScreen />
  if (state.authStatus === 'error') return <BootScreen error="Could not reach the server. Check your connection." onRetry={actions.retryBoot} />
  if (state.authStatus === 'guest') return <Navigate to="/onboarding" replace />
  return <Outlet />
}

function RequireGuest() {
  const { state, actions } = useApp()
  if (state.authStatus === 'checking') return <BootScreen />
  if (state.authStatus === 'error') return <BootScreen error="Could not reach the server. Check your connection." onRetry={actions.retryBoot} />
  if (state.authStatus === 'authenticated') return <Navigate to="/" replace />
  return <Outlet />
}

export default function App() {
  const { toasts } = useApp()
  return (
    <>
      <ToastHost toasts={toasts} />
      <Routes>
        {/* onboarding — guests only */}
        <Route element={<RequireGuest />}>
          <Route path="/onboarding" element={<Splash />} />
          <Route path="/onboarding/phone" element={<Phone />} />
          <Route path="/onboarding/otp" element={<Otp />} />
        </Route>

        <Route path="/session-expired" element={<SessionExpired />} />
        <Route path="/account-restricted" element={<AccountRestricted />} />

        {/* authenticated-only */}
        <Route element={<RequireAuth />}>
          {/* profile-setup steps run right after verify, while the session is already authenticated */}
          <Route path="/onboarding/profile" element={<ProfileSetup />} />
          <Route path="/onboarding/access" element={<AccessConfirmed />} />
          <Route path="/call/:id" element={<CallRoom />} />
          <Route path="/live/:id" element={<LiveRoom />} />

          <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/creator/:id" element={<Creator />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/:id" element={<Chat />} />
          <Route path="/calls" element={<Calls />} />
          <Route path="/live" element={<Live />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/add-balance" element={<AddBalance />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/vip" element={<Vip />} />
          <Route path="/logout" element={<Logout />} />
          <Route path="/offline" element={<Offline />} />

          <Route path="/settings/edit-profile" element={<EditProfile />} />
          <Route path="/settings/blocked" element={<BlockedCreators />} />
          <Route path="/settings/transactions" element={<Transactions />} />
          <Route path="/settings/talktime" element={<Talktime />} />
          <Route path="/settings/level" element={<LevelUp />} />
          <Route path="/settings/subscriptions" element={<Subscriptions />} />
          <Route path="/settings/languages" element={<Languages />} />
          <Route path="/settings/notifications" element={<NotificationSettings />} />
          <Route path="/settings/about" element={<About />} />
          <Route path="/settings/support" element={<Support />} />
          <Route path="/settings/terms" element={<Terms />} />
          <Route path="/settings/grievance" element={<Grievance />} />
          <Route path="/settings/delete" element={<DeleteAccount />} />

          <Route path="/call-ended/:id" element={<CallEnded />} />
          <Route path="/call-summary/:id" element={<CallSummary />} />
          <Route path="/gift-sent/:id" element={<GiftSent />} />
          <Route path="/block/:id" element={<BlockFlow />} />
          <Route path="/report/:id" element={<ReportFlow />} />

          <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </>
  )
}
