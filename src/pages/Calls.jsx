import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, PhoneOff, Video, Loader2, RotateCw } from 'lucide-react'
import { EmptyState, Button, Card, Avatar } from '../components/ui'
import { clock, beans, relTime, timeOfDay } from '../lib/format'
import { meApi, ApiError } from '../lib/api'

function normalizeCall(c) {
  return {
    id: c.id,
    hostId: c.hostId || c.host?.id,
    hostName: c.host?.name || c.hostName || 'Creator',
    ts: c.createdAt ? new Date(c.createdAt).getTime() : Date.now(),
    duration: c.durationSeconds ?? c.duration ?? 0,
    beans: c.spentBeans ?? c.beans ?? 0,
    status: c.status || 'Completed',
  }
}

export default function Calls() {
  const nav = useNavigate()
  const [calls, setCalls] = useState(null)
  const [error, setError] = useState('')

  const load = () => {
    setError('')
    meApi.calls(1, 30)
      .then((res) => setCalls((res.calls || res.items || []).map(normalizeCall)))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load calls'))
  }

  useEffect(load, [])

  if (calls === null && !error) {
    return <div className="grid place-items-center py-24"><Loader2 size={26} className="animate-spin text-subtle" /></div>
  }

  if (error) {
    return (
      <EmptyState icon={<RotateCw size={26} />} tone="rose" title="Could not load calls" text={error}>
        <Button onClick={load}>Retry</Button>
      </EmptyState>
    )
  }

  if (calls.length === 0) {
    return (
      <EmptyState
        icon={<PhoneOff size={28} />}
        title="No calls yet"
        text="Find a creator on Home and start a video call — your call history will build up here."
      >
        <Button onClick={() => nav('/')}><Video size={16} /> Find a creator</Button>
      </EmptyState>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[22px] font-extrabold tracking-tight text-ink">Calls</h1>
      <p className="mt-0.5 text-[13px] text-subtle">Tap any creator to open their profile and start a new call.</p>

      <Card className="mt-4 divide-y divide-line">
        {calls.map((call) => {
          const missed = /missed/i.test(call.status)
          return (
            <button key={call.id} onClick={() => nav(`/creator/${call.hostId}`)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-white/5">
              <Avatar id={call.hostId} size={44} />
              <div className="flex-1">
                <p className="text-[15px] font-semibold text-ink">{call.hostName}</p>
                <p className="flex items-center gap-1.5 text-[13px] text-subtle">
                  <Phone size={12} className={missed ? 'text-rose-500' : ''} />
                  {relTime(call.ts)}, {timeOfDay(call.ts)}
                  {!missed && ` · ${clock(call.duration)}`}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-[13px] font-semibold ${missed ? 'text-subtle' : 'text-gold'}`}>{missed ? '—' : `${beans(call.beans)} beans`}</p>
                <p className={`text-[12px] ${missed ? 'text-rose-500' : 'text-subtle'}`}>{call.status}</p>
              </div>
            </button>
          )
        })}
      </Card>
    </div>
  )
}
