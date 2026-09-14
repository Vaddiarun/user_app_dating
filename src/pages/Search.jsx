import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search as SearchIcon, X, SearchX, BadgeCheck, Loader2 } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Avatar, GradientBox, Button, EmptyState } from '../components/ui'
import { hostsApi } from '../lib/api'
import { normalizeHostList } from '../lib/normalize'

const G = [['#e6b980', '#c9822b'], ['#8f7fe0', '#5b28d6'], ['#7fd6a8', '#3f9878'], ['#d68f9b', '#9b3f5f']]

export default function Search() {
  const [q, setQ] = useState('')
  const [suggested, setSuggested] = useState([])
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()
  const { state } = useApp()

  useEffect(() => {
    hostsApi.list({ page: 1, pageSize: 4 }).then((res) => setSuggested(normalizeHostList(res))).catch(() => {})
  }, [])

  useEffect(() => {
    const t = q.trim()
    if (!t) { setResults(null); return }
    setLoading(true)
    const timer = setTimeout(() => {
      hostsApi.list({ q: t })
        .then((res) => setResults(normalizeHostList(res)))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  const shown = results?.filter((c) => !state.blocked.some((b) => b.id === c.id)) ?? null

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-2 rounded-xl border-2 border-brand bg-card px-4 py-3">
        <SearchIcon size={18} className="text-subtle" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search creators by name or language"
          className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-subtle"
        />
        {loading && <Loader2 size={16} className="animate-spin text-subtle" />}
        {q && !loading && <button onClick={() => setQ('')}><X size={16} className="text-subtle" /></button>}
      </div>

      {!shown && suggested.length > 0 && (
        <>
          <Section title="Suggested">
            <div className="divide-y divide-line rounded-2xl border border-line bg-card">
              {suggested.map((c) => (
                <button key={c.id} onClick={() => nav(`/creator/${c.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/5">
                  <Avatar id={c.id} size={44} ring ringColor="#e0a0a0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-semibold text-ink">{c.name}</span>
                      {c.verified && <BadgeCheck size={14} className="text-brand" />}
                      {c.live && <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">Live</span>}
                    </div>
                    <p className="text-[13px] text-subtle">{c.category} {c.languages?.length ? `· ${c.languages.join(', ')}` : ''}</p>
                  </div>
                  <span className="text-subtle">›</span>
                </button>
              ))}
            </div>
          </Section>
        </>
      )}

      {shown && shown.length === 0 && !loading && (
        <EmptyState
          icon={<SearchX size={28} />}
          title="No creators match your search"
          text="Try a shorter search, or clear it to browse everyone."
        >
          <Button variant="outline" onClick={() => setQ('')}>Clear search</Button>
          <Button onClick={() => nav('/')}>Browse Home</Button>
        </EmptyState>
      )}

      {shown && shown.length > 0 && (
        <Section title={`${shown.length} result${shown.length > 1 ? 's' : ''}`}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {shown.map((c, i) => (
              <button key={c.id} onClick={() => nav(`/creator/${c.id}`)} className="overflow-hidden rounded-2xl border border-line bg-card text-left shadow-card">
                <GradientBox from={G[i % G.length][0]} to={G[i % G.length][1]} seed={i} className="h-28">
                  {c.live && <span className="absolute left-2 top-2 rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">Live</span>}
                </GradientBox>
                <div className="p-3">
                  <div className="flex items-center gap-1">
                    <span className="text-[14px] font-semibold text-ink">{c.name}</span>
                    {c.verified && <BadgeCheck size={13} className="text-brand" />}
                  </div>
                  <p className="text-[12px] text-subtle">{c.category} {c.languages?.length ? `· ${c.languages.join(', ')}` : ''}</p>
                  <p className="mt-1 text-[11px] text-subtle">{c.followerCount} followers</p>
                </div>
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mt-6">
      <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-subtle">{title}</p>
      {children}
    </div>
  )
}
