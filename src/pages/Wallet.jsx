import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Plus, Check, X, RotateCw, CreditCard, Wallet as WalletIcon, Loader2,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Button, Card, EmptyState } from '../components/ui'
import { beans } from '../lib/format'
import { walletApi, ApiError } from '../lib/api'

export default function Wallet() {
  const { state } = useApp()
  const nav = useNavigate()
  const [packages, setPackages] = useState([])

  useEffect(() => {
    walletApi.packages().then((res) => setPackages(res.packages || [])).catch(() => {})
  }, [])

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[22px] font-extrabold tracking-tight text-ink">Wallet</h1>

      <Card className="mt-4 p-5">
        <p className="text-[13px] font-semibold text-subtle">Available balance</p>
        {state.wallet ? (
          <>
            <p className="mt-1 text-[32px] font-extrabold text-gold">
              {beans(state.wallet.displayBeans)} <span className="text-[15px] font-semibold text-subtle">beans</span>
            </p>
            <p className="text-[12px] text-subtle">₹{((state.wallet.balancePaise || 0) / 100).toFixed(2)} wallet balance</p>
          </>
        ) : (
          <Loader2 size={22} className="mt-2 animate-spin text-subtle" />
        )}
        <Button variant="gold" className="mt-3 w-full py-3" onClick={() => nav('/add-balance')}><Plus size={16} /> Add balance</Button>
        {packages.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {packages.slice(0, 3).map((p) => (
              <button key={p.id} onClick={() => nav(`/add-balance?pkg=${p.id}`)} className="rounded-xl border border-line py-3 text-center hover:border-brand-200">
                <p className="text-[14px] font-bold text-ink">₹{(p.pricePaise ?? p.price ?? 0) / 100 || p.amount}</p>
                <p className="text-[11px] text-subtle">{beans(p.beans ?? p.displayBeans ?? 0)} beans</p>
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-6">
        <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-subtle">Recharge packages</p>
        {packages.length === 0 ? (
          <EmptyState icon={<WalletIcon size={24} />} tone="gold" title="Loading packages…" text="" />
        ) : (
          <Card className="divide-y divide-line">
            {packages.map((p) => (
              <button key={p.id} onClick={() => nav(`/add-balance?pkg=${p.id}`)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-white/5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand dark:bg-brand/15"><CreditCard size={17} /></span>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-ink">₹{((p.pricePaise ?? p.price ?? 0) / 100) || p.amount}</p>
                  <p className="text-[12px] text-subtle">{beans(p.beans ?? p.displayBeans ?? 0)} beans</p>
                </div>
              </button>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}

export function AddBalance() {
  const { state, actions, toast } = useApp()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [packages, setPackages] = useState(null)
  const [pack, setPack] = useState(null)
  const [phase, setPhase] = useState('form') // form | processing | done | failed
  const [error, setError] = useState('')

  useEffect(() => {
    walletApi.packages()
      .then((res) => {
        const list = res.packages || []
        setPackages(list)
        const preselect = sp.get('pkg')
        setPack(list.find((p) => p.id === preselect) || list[0] || null)
      })
      .catch(() => setPackages([]))
  }, []) // eslint-disable-line

  const pay = async (outcome = 'success') => {
    if (!pack) return
    setPhase('processing')
    setError('')
    try {
      const txn = await walletApi.initiateRecharge(pack.id)
      await new Promise((r) => setTimeout(r, 1200))
      await walletApi.devResolveRecharge(txn.id, outcome)
      if (outcome === 'success') {
        await actions.refreshWallet()
        if (state.notifPrefs?.wallet) actions.addNotification({ kind: 'wallet', title: 'Balance added', body: `Recharge of ₹${((pack.pricePaise ?? pack.price ?? 0) / 100) || pack.amount} confirmed` })
        setPhase('done')
      } else {
        setPhase('failed')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
      setPhase('failed')
    }
  }

  if (packages === null) {
    return <div className="grid place-items-center py-24"><Loader2 size={26} className="animate-spin text-subtle" /></div>
  }

  if (phase === 'processing') {
    return (
      <Centered>
        <span className="grid h-20 w-20 place-items-center rounded-2xl bg-brand-50 text-brand dark:bg-brand/15"><WalletIcon size={32} /></span>
        <h1 className="mt-4 text-[19px] font-bold text-ink">Processing payment</h1>
        <p className="mt-2 text-[13px] text-subtle">Confirming ₹{pack ? ((pack.pricePaise ?? pack.price ?? 0) / 100) || pack.amount : ''}. Don't close the app.</p>
        <span className="mt-4 flex items-center gap-1.5 rounded-full bg-gold-soft px-3 py-1 text-[13px] font-semibold text-gold dark:bg-gold/15">
          <span className="h-2 w-2 animate-pulse rounded-full bg-gold" /> Pending confirmation
        </span>
      </Centered>
    )
  }

  if (phase === 'done') {
    return (
      <Centered>
        <span className="relative grid h-24 w-24 place-items-center">
          <span className="absolute inset-0 rounded-full bg-green-500/20" />
          <span className="grid h-14 w-14 place-items-center rounded-full bg-green-600 text-white"><Check size={26} /></span>
        </span>
        <h1 className="mt-4 text-[20px] font-bold text-ink">Balance added</h1>
        <Card className="mt-5 w-full p-4 text-center">
          <p className="text-[13px] text-subtle">New balance</p>
          <p className="mt-1 text-[24px] font-extrabold text-gold">{beans(state.wallet?.displayBeans ?? 0)} <span className="text-[14px] font-semibold text-subtle">beans</span></p>
        </Card>
        <Button className="mt-4 w-full py-3" onClick={() => nav('/wallet')}>Back to wallet</Button>
      </Centered>
    )
  }

  if (phase === 'failed') {
    return (
      <Centered>
        <span className="relative grid h-24 w-24 place-items-center">
          <span className="absolute inset-0 rounded-full bg-rose-500/15" />
          <span className="grid h-14 w-14 place-items-center rounded-full bg-rose-500 text-white"><X size={26} /></span>
        </span>
        <h1 className="mt-4 text-[20px] font-bold text-ink">Payment failed</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-subtle">{error || 'Your bank declined the transaction. No amount was deducted.'}</p>
        <Button className="mt-5 w-full py-3" onClick={() => setPhase('form')}><RotateCw size={16} /> Try again</Button>
        <Button variant="outline" className="mt-3 w-full py-3" onClick={() => nav('/wallet')}>Back to wallet</Button>
      </Centered>
    )
  }

  return (
    <div className="mx-auto max-w-md px-1 py-2">
      <h1 className="text-[20px] font-bold text-ink">Add balance</h1>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {packages.map((p) => (
          <button
            key={p.id}
            onClick={() => setPack(p)}
            className={`rounded-2xl border p-4 text-left ${pack?.id === p.id ? 'border-2 border-brand bg-brand-50 dark:bg-brand/15' : 'border-line'}`}
          >
            <p className="text-[16px] font-bold text-ink">₹{((p.pricePaise ?? p.price ?? 0) / 100) || p.amount}</p>
            <p className="text-[13px] font-medium text-gold">{beans(p.beans ?? p.displayBeans ?? 0)} beans</p>
          </button>
        ))}
      </div>

      <p className="mt-6 text-[12px] font-bold uppercase tracking-wide text-subtle">Payment method</p>
      <div className="mt-2 rounded-2xl border border-line px-4 py-3.5 text-[13px] text-subtle">
        No real payment gateway is wired up yet — this confirms instantly via the backend's dev-resolve endpoint.
      </div>

      <Button variant="gold" className="mt-5 w-full py-3.5" disabled={!pack} onClick={() => pay('success')}>
        Pay ₹{pack ? ((pack.pricePaise ?? pack.price ?? 0) / 100) || pack.amount : ''}
      </Button>
      <button className="mt-3 w-full text-[12px] font-medium text-subtle underline" onClick={() => pay('failed')}>Simulate a declined payment</button>
    </div>
  )
}

function Centered({ children }) {
  return <div className="mx-auto flex max-w-md flex-col items-center px-4 py-12 text-center">{children}</div>
}
