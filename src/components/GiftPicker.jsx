import { useEffect, useState } from 'react'
import { Gift as GiftIcon, Loader2 } from 'lucide-react'
import { Modal, Button } from './ui'
import { rupees } from '../lib/format'
import { giftsApi } from '../lib/api'
import { normalizeGift } from '../lib/normalize'

// `balance` and every gift's price are both in paise — gifts have no "beans"
// display value of their own (only the wallet balance does).
export default function GiftPicker({ balance, onSend, onClose }) {
  const [gifts, setGifts] = useState(null)
  const [sel, setSel] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    giftsApi.catalog()
      .then((res) => {
        if (!alive) return
        const list = (res.gifts || res || []).map(normalizeGift)
        setGifts(list)
        setSel(list[0] || null)
      })
      .catch(() => alive && setError('Could not load gifts'))
    return () => { alive = false }
  }, [])

  const send = async () => {
    if (!sel) return
    setSending(true)
    setError('')
    try {
      await onSend(sel)
    } catch (err) {
      setError(err?.message || 'Could not send gift')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Send a gift">
      <p className="flex items-center justify-between text-[13px] text-subtle">
        Your balance <span className="font-bold text-gold">₹{rupees(balance)}</span>
      </p>
      {!gifts ? (
        <div className="mt-4 grid place-items-center py-6"><Loader2 size={22} className="animate-spin text-subtle" /></div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {gifts.map((g) => (
            <button
              key={g.id}
              onClick={() => setSel(g)}
              className={`rounded-xl border py-3 text-center transition ${
                sel?.id === g.id ? 'border-brand bg-brand-50 dark:bg-brand/15' : 'border-line hover:border-brand-200'
              }`}
            >
              {g.iconUrl ? (
                <img src={g.iconUrl} alt="" className="mx-auto h-7 w-7 object-contain" />
              ) : (
                <GiftIcon size={22} className="mx-auto text-brand" />
              )}
              <div className="mt-1 text-[13px] font-semibold text-ink">{g.name}</div>
              <div className="text-[12px] font-semibold text-gold">₹{rupees(g.pricePaise)}</div>
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-[12px] font-medium text-rose-500">{error}</p>}
      <Button
        className="mt-4 w-full py-3"
        disabled={!sel || sending || balance < (sel?.pricePaise ?? Infinity)}
        onClick={send}
      >
        {sending ? <Loader2 size={16} className="animate-spin" /> : null}
        {sel && balance < sel.pricePaise ? 'Not enough balance' : sel ? `Send ${sel.name} · ₹${rupees(sel.pricePaise)}` : 'Loading…'}
      </Button>
    </Modal>
  )
}
