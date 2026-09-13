import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellOff, Wallet, Radio, MessageSquare, Phone, Film } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Avatar, EmptyState, Card } from '../components/ui'
import { relTime } from '../lib/format'

const KIND_ICON = {
  wallet: <Wallet size={16} className="text-gold" />,
  live: <Radio size={16} className="text-rose-500" />,
  chat: <MessageSquare size={16} className="text-brand" />,
  call: <Phone size={16} className="text-brand" />,
  media: <Film size={16} className="text-brand" />,
}

export default function Notifications() {
  const { state, dispatch } = useApp()
  const nav = useNavigate()

  useEffect(() => {
    const t = setTimeout(() => dispatch({ type: 'notif/readAll' }), 1200)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line

  if (state.notifications.length === 0) {
    return (
      <EmptyState
        icon={<BellOff size={28} />}
        tone="green"
        title="You're all caught up"
        text="New replies, call reminders and gift receipts will show up here."
      />
    )
  }

  const unread = state.notifications.filter((n) => !n.read).length

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-extrabold tracking-tight text-ink">Notifications</h1>
        {unread > 0 && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-bold text-brand dark:bg-brand/15">{unread} new</span>}
      </div>

      <Card className="mt-4 divide-y divide-line">
        {state.notifications.map((n) => (
          <button
            key={n.id}
            onClick={() => n.creatorId && nav(n.kind === 'live' ? `/live/${n.creatorId}` : n.kind === 'chat' ? `/chat/${n.creatorId}` : `/creator/${n.creatorId}`)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-white/5"
          >
            {n.creatorId ? (
              <Avatar id={n.creatorId} size={40} />
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gold-soft dark:bg-gold/15">{KIND_ICON[n.kind] || <Bell size={16} />}</span>
            )}
            <div className="flex-1">
              <p className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
                {n.title} {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
              </p>
              <p className="text-[13px] text-subtle">{n.body}</p>
            </div>
            <span className="text-[12px] text-subtle">{relTime(n.ts)}</span>
          </button>
        ))}
      </Card>
    </div>
  )
}
