import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, WifiOff, Clock, ShieldAlert, RotateCw, LogOut } from 'lucide-react'
import { Button, Card } from '../components/ui'
import { useApp } from '../store/AppStore'

function Center({ children }) {
  return <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">{children}</div>
}

export function NotFound() {
  const nav = useNavigate()
  return (
    <Center>
      <span className="grid h-24 w-24 place-items-center rounded-full border-2 border-dashed border-rose-200 bg-rose-50 text-rose-500 dark:bg-rose-500/15">
        <AlertTriangle size={32} />
      </span>
      <h1 className="mt-4 text-[20px] font-bold text-ink">Something went wrong</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-subtle">We couldn't load this page. It's usually temporary — give it another try.</p>
      <Button className="mt-5 w-full py-3" onClick={() => nav('/')}><RotateCw size={16} /> Back to home</Button>
    </Center>
  )
}

export function Offline() {
  const nav = useNavigate()
  return (
    <Center>
      <span className="grid h-24 w-24 place-items-center rounded-full border-2 border-dashed border-gold bg-gold-soft text-gold dark:bg-gold/15">
        <WifiOff size={30} />
      </span>
      <h1 className="mt-4 text-[20px] font-bold text-ink">You're offline</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-subtle">Check your connection. Vibe will refresh automatically once you're back online.</p>
      <Button variant="outline" className="mt-5 w-full py-3" onClick={() => nav(0)}><RotateCw size={16} /> Try again</Button>
    </Center>
  )
}

export function SessionExpired() {
  const nav = useNavigate()
  return (
    <Center>
      <span className="grid h-24 w-24 place-items-center rounded-full border-2 border-dashed border-gold bg-gold-soft text-gold dark:bg-gold/15">
        <Clock size={30} />
      </span>
      <h1 className="mt-4 text-[20px] font-bold text-ink">Session expired</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-subtle">For your security you've been signed out after a period of inactivity.</p>
      <Button className="mt-5 w-full py-3" onClick={() => nav('/onboarding')}>Sign in again</Button>
    </Center>
  )
}

export function AccountRestricted() {
  const location = useLocation()
  const caseRef = location.state?.caseRef
  return (
    <Center>
      <span className="grid h-24 w-24 place-items-center rounded-full bg-gray-100 dark:bg-white/10">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-ink text-white"><ShieldAlert size={22} /></span>
      </span>
      <h1 className="mt-4 text-[20px] font-bold text-ink">Account restricted</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-subtle">
        This account was suspended after repeated screenshot attempts on protected content.
      </p>
      <Card className="mt-5 w-full p-4 text-left">
        {caseRef && (
          <>
            <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">Reference</p>
            <p className="text-[15px] font-bold text-ink">{caseRef}</p>
          </>
        )}
        <p className={caseRef ? 'mt-2 text-[12px] text-subtle' : 'text-[12px] text-subtle'}>
          If you believe this is a mistake, contact <span className="font-semibold text-ink">support@vibe.app</span>
          {caseRef ? ' with the reference above.' : '.'}
        </p>
      </Card>
    </Center>
  )
}

export function Logout() {
  const nav = useNavigate()
  const { actions } = useApp()
  const [busy, setBusy] = useState(false)
  const logout = async () => {
    setBusy(true)
    try { await actions.logout() } finally { nav('/onboarding') }
  }
  return (
    <Center>
      <span className="grid h-20 w-20 place-items-center rounded-full bg-rose-50 text-rose-500 dark:bg-rose-500/15"><LogOut size={28} /></span>
      <h1 className="mt-4 text-[19px] font-bold text-ink">Log out?</h1>
      <p className="mt-2 text-[13px] text-subtle">You'll need to verify your number again to sign back in.</p>
      <div className="mt-5 flex w-full gap-3">
        <Button variant="outline" className="flex-1 py-3" onClick={() => nav(-1)}>Cancel</Button>
        <Button variant="danger" className="flex-1 py-3" disabled={busy} onClick={logout}>Log out</Button>
      </div>
    </Center>
  )
}
