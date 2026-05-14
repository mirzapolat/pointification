import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'

const SCOPES = [
  { id: 'week', label: 'Week',    days: 7 },
  { id: 'm1',   label: 'Month',   days: 30 },
  { id: 'm3',   label: '3 mo',    days: 90 },
  { id: 'm6',   label: '6 mo',    days: 180 },
  { id: 'y1',   label: '12 mo',   days: 365 },
  { id: 'all',  label: 'All',     days: null }
]

export default function GameLog() {
  const { id } = useParams()
  const nav = useNavigate()
  const [game, setGame] = useState(null)
  const [teams, setTeams] = useState([])
  const [logs, setLogs] = useState([])
  const [scope, setScope] = useState('m1')
  const [view, setView] = useState('graph') // 'graph' | 'list'
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [{ data: g }, { data: t }, { data: l }] = await Promise.all([
      supabase.from('games').select('id, name').eq('id', id).single(),
      supabase.from('teams').select('id, name, color, score').eq('game_id', id).order('position'),
      supabase.from('point_logs')
        .select('id, team_id, delta, new_score, created_at')
        .eq('game_id', id)
        .order('created_at', { ascending: true })
    ])
    setGame(g ?? null)
    setTeams(t ?? [])
    setLogs(l ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  // Realtime: new log rows appear live
  useEffect(() => {
    const channel = supabase.channel(`logs:${id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'point_logs', filter: `game_id=eq.${id}` },
        (payload) => setLogs(prev => [...prev, payload.new]))
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'point_logs', filter: `game_id=eq.${id}` },
        (payload) => setLogs(prev => prev.filter(l => l.id !== payload.old.id)))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `game_id=eq.${id}` },
        load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  const teamMap = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams])

  const scopeObj = SCOPES.find(s => s.id === scope)
  const since = scopeObj?.days
    ? Date.now() - scopeObj.days * 24 * 60 * 60 * 1000
    : null

  const filteredLogs = useMemo(() => {
    if (since == null) return logs
    return logs.filter(l => new Date(l.created_at).getTime() >= since)
  }, [logs, since])

  if (loading) {
    return <div className="h-full grid place-items-center bg-cream font-display text-3xl animate-pulse">loading…</div>
  }
  if (!game) {
    return (
      <div className="h-full grid place-items-center bg-cream">
        <div className="card-chunk p-8 text-center">
          <h2 className="font-display text-3xl font-bold">Game not found</h2>
          <Link to="/" className="btn-chunk bg-candy-mint mt-4">← Back</Link>
        </div>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-full bg-cream bg-grid">
      <header className="px-4 md:px-6 py-3 flex items-center justify-between bg-cream/80 backdrop-blur border-b-2 border-ink sticky top-0 z-20">
        <button onClick={() => nav('/')} className="btn-chunk bg-white text-sm py-2 px-3">← Games</button>
        <h1 className="font-display font-bold text-xl md:text-2xl truncate px-3">{game.name} · Log</h1>
        <Link to={`/game/${id}`} className="btn-chunk bg-candy-yellow text-sm py-2 px-3">Open game →</Link>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-6">
        {/* View switcher */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex p-1 rounded-2xl border-2 border-ink bg-white">
            {['graph', 'list'].map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-2 rounded-xl font-display font-semibold capitalize transition ${view === v ? 'bg-ink text-cream' : 'text-ink/70 hover:text-ink'}`}
              >{v}</button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 p-1 rounded-2xl border-2 border-ink bg-white">
            {SCOPES.map(s => (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                className={`px-3 py-1.5 rounded-xl font-display font-semibold text-sm transition ${scope === s.id ? 'bg-candy-pink text-white' : 'text-ink/70 hover:text-ink'}`}
              >{s.label}</button>
            ))}
          </div>
        </div>

        {/* Team legend */}
        <div className="flex flex-wrap gap-2">
          {teams.map(t => (
            <span key={t.id} className="px-3 py-1.5 rounded-full border-2 border-ink text-sm font-semibold" style={{ background: t.color }}>
              {t.name} <span className="opacity-60">· {t.score}</span>
            </span>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {view === 'graph' ? (
            <motion.div key="graph"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="card-chunk p-4 md:p-6">
              <ScoreGraph teams={teams} logs={filteredLogs} since={since} />
            </motion.div>
          ) : (
            <motion.div key="list"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <LogList logs={filteredLogs} teamMap={teamMap} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </motion.div>
  )
}

function LogList({ logs, teamMap }) {
  if (logs.length === 0) {
    return (
      <div className="card-chunk p-10 text-center">
        <div className="text-5xl mb-3">📜</div>
        <h3 className="font-display text-2xl font-bold">Nothing in this window</h3>
        <p className="text-ink/60 mt-1">Try a longer scope.</p>
      </div>
    )
  }
  // Newest first for the list
  const ordered = [...logs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return (
    <div className="card-chunk overflow-hidden">
      <ul className="divide-y-2 divide-ink/10">
        {ordered.map(l => {
          const t = teamMap[l.team_id]
          const pos = l.delta >= 0
          return (
            <motion.li
              key={l.id}
              layout
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 px-4 md:px-6 py-3"
            >
              <div className="w-3 h-10 rounded-full" style={{ background: t?.color ?? '#ccc' }} />
              <div className="flex-1 min-w-0">
                <div className="font-display font-semibold truncate">{t?.name ?? 'Deleted team'}</div>
                <div className="text-xs text-ink/60">{formatDateTime(l.created_at)}</div>
              </div>
              <div className={`font-display font-bold text-xl tabular-nums ${pos ? 'text-emerald-700' : 'text-rose-700'}`}>
                {pos ? `+${l.delta}` : l.delta}
              </div>
              <div className="hidden sm:block text-ink/60 text-sm tabular-nums w-20 text-right">
                → {l.new_score}
              </div>
            </motion.li>
          )
        })}
      </ul>
    </div>
  )
}

function ScoreGraph({ teams, logs, since }) {
  const W = 900, H = 360, P = { l: 44, r: 16, t: 16, b: 28 }

  const now = Date.now()
  const startTs = since ?? (logs.length ? new Date(logs[0].created_at).getTime() : now - 7 * 86400 * 1000)
  const endTs = now

  // Build per-team series of (ts, score)
  const series = useMemo(() => teams.map(team => {
    const teamLogs = logs.filter(l => l.team_id === team.id)
    // Score at start of window: derive from first in-window log's (new_score - delta).
    // No pre-window logs are loaded, so if there are none we fall back to the team's current score.
    let startScore = 0
    if (teamLogs.length) {
      startScore = teamLogs[0].new_score - teamLogs[0].delta
    } else {
      startScore = team.score
    }
    const pts = [{ ts: startTs, score: startScore }]
    for (const l of teamLogs) pts.push({ ts: new Date(l.created_at).getTime(), score: l.new_score })
    pts.push({ ts: endTs, score: pts[pts.length - 1].score })
    return { team, pts }
  }), [teams, logs, startTs, endTs])

  const allScores = series.flatMap(s => s.pts.map(p => p.score))
  let yMin = Math.min(0, ...allScores)
  let yMax = Math.max(0, ...allScores)
  if (yMin === yMax) { yMin -= 1; yMax += 1 }
  // pad
  const yPad = Math.max(1, Math.round((yMax - yMin) * 0.08))
  yMin -= yPad; yMax += yPad

  const x = ts => P.l + (W - P.l - P.r) * ((ts - startTs) / (endTs - startTs || 1))
  const y = score => P.t + (H - P.t - P.b) * (1 - (score - yMin) / (yMax - yMin))

  // ticks
  const yTicks = niceTicks(yMin, yMax, 5)
  const xTicks = timeTicks(startTs, endTs, 6)

  const hasData = logs.length > 0
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ minWidth: 320 }}>
        {/* y grid + labels */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="#0F0F12" strokeOpacity={v === 0 ? 0.4 : 0.08} strokeDasharray={v === 0 ? '0' : '3 4'} />
            <text x={P.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#0F0F12" fillOpacity="0.6">{v}</text>
          </g>
        ))}
        {/* x labels */}
        {xTicks.map((t, i) => (
          <g key={i}>
            <line x1={x(t)} x2={x(t)} y1={H - P.b} y2={H - P.b + 4} stroke="#0F0F12" strokeOpacity="0.3" />
            <text x={x(t)} y={H - P.b + 16} textAnchor="middle" fontSize="11" fill="#0F0F12" fillOpacity="0.6">
              {formatTick(t, endTs - startTs)}
            </text>
          </g>
        ))}
        {/* axes */}
        <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke="#0F0F12" strokeWidth="2" />
        <line x1={P.l} x2={P.l}     y1={P.t}      y2={H - P.b} stroke="#0F0F12" strokeWidth="2" />

        {/* lines */}
        {series.map(({ team, pts }) => {
          const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${x(p.ts).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ')
          return (
            <g key={team.id}>
              <motion.path
                d={d}
                fill="none"
                stroke="#0F0F12"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
              <motion.path
                d={d}
                fill="none"
                stroke={team.color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              />
              {pts.slice(1, -1).map((p, i) => (
                <circle key={i} cx={x(p.ts)} cy={y(p.score)} r="4.5" fill={team.color} stroke="#0F0F12" strokeWidth="2" />
              ))}
            </g>
          )
        })}

        {!hasData && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontFamily="Space Grotesk" fontSize="22" fill="#0F0F12" fillOpacity="0.4">
            No point changes in this window
          </text>
        )}
      </svg>
    </div>
  )
}

function niceTicks(min, max, count) {
  const range = max - min
  const step = Math.pow(10, Math.floor(Math.log10(range / count)))
  const err = (range / count) / step
  let s = step
  if (err >= 7.5) s = step * 10
  else if (err >= 3) s = step * 5
  else if (err >= 1.5) s = step * 2
  const start = Math.ceil(min / s) * s
  const out = []
  for (let v = start; v <= max; v += s) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

function timeTicks(start, end, count) {
  const out = []
  for (let i = 0; i <= count; i++) out.push(start + (end - start) * (i / count))
  return out
}

function formatTick(ts, span) {
  const d = new Date(ts)
  if (span <= 2 * 86400 * 1000) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (span <= 90 * 86400 * 1000) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString([], { month: 'short', year: '2-digit' })
}

function formatDateTime(iso) {
  const d = new Date(iso)
  return d.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
