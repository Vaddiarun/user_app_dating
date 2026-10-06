import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Headphones } from 'lucide-react'

/* Floating "Need help?" button (bottom-right, like Airtel / bank apps) that opens the support
 * chat. Shows its label for a few seconds, then shrinks to just the round icon so it doesn't
 * cover the list. Sits above the phone bottom nav. */
export default function SupportFab({ to = '/settings/support/chat' }) {
  const nav = useNavigate()
  const [expanded, setExpanded] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setExpanded(false), 4000)
    return () => clearTimeout(t)
  }, [])

  return (
    <button
      onClick={() => nav(to)}
      aria-label="Chat with support"
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 flex animate-fadeIn items-center gap-2 rounded-full bg-gradient-to-br from-brand to-[#3d1a9e] p-1.5 text-white shadow-[0_10px_25px_-5px_rgba(91,40,214,.55)] transition-all duration-300 active:scale-95 lg:bottom-8 lg:right-8"
    >
      <span className="relative grid h-11 w-11 place-items-center rounded-full bg-white/15">
        <span className="absolute inset-0 animate-ping rounded-full bg-white/20 [animation-duration:2.4s]" />
        <Headphones size={21} />
      </span>
      <span className={`overflow-hidden whitespace-nowrap text-[14px] font-bold transition-all duration-300 ${expanded ? 'max-w-[120px] pr-3 opacity-100' : 'max-w-0 opacity-0'}`}>
        Need help?
      </span>
    </button>
  )
}
