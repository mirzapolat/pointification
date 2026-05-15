import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'

const SCOPES = [
  { id: 'week', label: 'Week',    days: 7   },
  { id: 'm1',   label: 'Month',   days: 30  },
  { id: 'm3',   label: '3 mo',    days: 90  },
  { id: 'm6',   label: '6 mo',    days: 180 },
  { id: 'y1',   label: '12 mo',   days: 365 },
  { id: 'all',  label: 'All',     days: null },
]

const DAY = 86400 * 1000

export default function GameLog() {
  const { id } = useParams()
  const nav = useNavigate()
  const [game, setGame] = useState(null)
  const [teams, setTeams] = useState([])
  const [logs, setLogs] = useState([])
  const [scope, setScope] = useState('m1')
  const [loading, setLoading] = useState(true)
  const [emailMap, setEmailMap] = useState({})

  const load = async () => {
    const [{ data: g }, { data: t }, { data: l }] = await Promise.all([
      supabase.from('games').select('id, name').eq('id', id).single(),
      supabase.from('teams').select('id, name, color, score').eq('game_id', id).order('position'),
      supabase.from('point_logs')
        .select('id, team_id, user_id, delta, new_score, created_at')
        .eq('game_id', id)
        .order('created_at', { ascending: true })
    ])
    setGame(g ?? null)
    setTeams(t ?? [])
    setLogs(l ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

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

  useEffect(() => {
    const ids = Array.from(new Set(logs.map(l => l.user_id).filter(Boolean)))
    const missing = ids.filter(i => !(i in emailMap))
    if (!missing.length) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('profiles').select('id, email').in('id', missing)
      if (cancelled || !data) return
      setEmailMap(prev => {
        const next = { ...prev }
        for (const p of data) next[p.id] = p.email
        return next
      })
    })()
    return () => { cancelled = true }
  }, [logs])

  const teamMap = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams])

  const scopeObj = SCOPES.find(s => s.id === scope)
  const since = scopeObj?.days ? Date.now() - scopeObj.days * DAY : null

  const filteredLogs = useMemo(() => {
    if (since == null) return logs
    return logs.filter(l => new Date(l.created_at).getTime() >= since)
  }, [logs, since])

  const { boundaries, series } = useMemo(
    () => computeSeries(teams, logs, since),
    [teams, logs, since]
  )

  const stats = useMemo(() => computeStats(filteredLogs, teams, teamMap), [filteredLogs, teams, teamMap])

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
      <header className="px-4 md:px-8 py-3 md:py-4 flex items-center justify-between gap-3 bg-cream/80 backdrop-blur border-b-2 border-ink sticky top-0 z-20">
        <button
          onClick={() => nav('/')}
          className="btn-chunk bg-white text-sm py-2 p-2 md:px-3"
          aria-label="Back to games"
          title="Back to games"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="md:hidden">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          <span className="hidden md:inline">← Games</span>
        </button>
        <div className="min-w-0 text-center flex-1">
          <h1 className="font-display font-bold text-lg md:text-2xl truncate leading-none">{game.name}</h1>
          <div className="text-xs md:text-sm text-ink/60 mt-0.5">Details</div>
        </div>
        <Link
          to={`/game/${id}`}
          className="btn-chunk bg-candy-yellow text-sm py-2 p-2 md:px-3"
          aria-label="Open game"
          title="Open game"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="md:hidden">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <span className="hidden md:inline">Open game →</span>
        </Link>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10 space-y-6 md:space-y-8">
        <ScopeControl scope={scope} setScope={setScope} />

        <section className="grid grid-cols-1 lg:grid-cols-5 gap-5 md:gap-6 lg:items-start">
          <div className="lg:col-span-2">
            <StatCards stats={stats} />
          </div>

          <div className="lg:col-span-3 card-chunk p-4 md:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h2 className="font-display font-bold text-xl md:text-2xl">Score over time</h2>
              <div className="text-xs text-ink/50 hidden sm:block">Hover or tap to inspect</div>
            </div>
            <ScoreGraph boundaries={boundaries} series={series} hasData={filteredLogs.length > 0} />
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-5 gap-5 md:gap-6 lg:items-start">
          <div className="lg:col-span-2">
            <TeamCards teams={teams} series={series} filteredLogs={filteredLogs} />
          </div>

          <div className="lg:col-span-3 card-chunk overflow-hidden flex flex-col min-h-0">
            <div className="px-5 md:px-6 py-4 border-b-2 border-ink flex items-center justify-between">
              <h2 className="font-display font-bold text-xl">Activity</h2>
              <span className="text-xs px-2 py-0.5 rounded-full border-2 border-ink bg-cream font-semibold tabular-nums">
                {filteredLogs.length}
              </span>
            </div>
            <ActivityLog logs={filteredLogs} teamMap={teamMap} emailMap={emailMap} />
          </div>
        </section>
      </main>
    </motion.div>
  )
}

/* -------- scope control -------- */

function ScopeControl({ scope, setScope }) {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden md:flex flex-wrap gap-1 p-1 rounded-2xl border-2 border-ink bg-white">
        {SCOPES.map(s => (
          <button
            key={s.id}
            onClick={() => setScope(s.id)}
            className={`px-3 py-1.5 rounded-xl font-display font-semibold text-sm transition ${
              scope === s.id ? 'bg-candy-pink text-white' : 'text-ink/70 hover:text-ink hover:bg-cream'
            }`}
          >{s.label}</button>
        ))}
      </div>
      <label className="md:hidden flex-1">
        <span className="sr-only">Time range</span>
        <div className="relative">
          <select
            value={scope}
            onChange={e => setScope(e.target.value)}
            className="input-chunk appearance-none pr-10 font-display font-semibold"
          >
            {SCOPES.map(s => (
              <option key={s.id} value={s.id}>Range · {s.label}</option>
            ))}
          </select>
          <svg
            aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </label>
    </div>
  )
}

/* -------- stat cards -------- */

function StatCards({ stats }) {
  const items = [
    {
      label: 'Leader',
      value: stats.leader ? stats.leader.name : '—',
      sub: stats.leader ? `${stats.leader.score} pts` : 'no teams yet',
      bg: 'bg-candy-yellow',
      swatch: stats.leader?.color,
    },
    {
      label: 'Events',
      value: stats.events,
      sub: 'in window',
      bg: 'bg-candy-mint',
    },
    {
      label: 'Net change',
      value: (stats.net > 0 ? '+' : '') + stats.net,
      sub: 'sum of deltas',
      bg: 'bg-candy-blue',
    },
    {
      label: 'Biggest swing',
      value: stats.swing ? (stats.swing.delta > 0 ? `+${stats.swing.delta}` : stats.swing.delta) : '—',
      sub: stats.swing?.teamName ?? 'no points yet',
      bg: 'bg-candy-pink',
    },
  ]

  return (
    <section className="grid grid-cols-2 gap-3 md:gap-4">
      {items.map((it, i) => (
        <motion.div
          key={it.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className={`card-chunk p-4 md:p-5 ${it.bg}`}
        >
          <div className="text-xs font-bold uppercase tracking-wider text-ink/70">
            {it.label}
          </div>
          <div className="font-display font-bold text-ink text-2xl md:text-3xl mt-1 leading-tight truncate flex items-center gap-2">
            {it.swatch && (
              <span className="inline-block w-3 h-3 rounded-full border-2 border-ink shrink-0" style={{ background: it.swatch }} />
            )}
            <span className="truncate">{it.value}</span>
          </div>
          <div className="text-xs mt-1 truncate text-ink/70">{it.sub}</div>
        </motion.div>
      ))}
    </section>
  )
}

/* -------- team cards with sparkline + window delta -------- */

function TeamCards({ teams, series, filteredLogs }) {
  if (!teams.length) return null
  const windowDelta = useMemo(() => {
    const map = {}
    for (const l of filteredLogs) map[l.team_id] = (map[l.team_id] ?? 0) + l.delta
    return map
  }, [filteredLogs])

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 md:gap-4">
      {teams.map((t, i) => {
        const s = series.find(x => x.team.id === t.id)
        const delta = windowDelta[t.id] ?? 0
        return (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="card-chunk p-4 md:p-5 flex items-center gap-4"
          >
            <div className="w-10 h-14 rounded-xl border-2 border-ink shrink-0" style={{ background: t.color }} />
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold text-lg truncate">{t.name}</div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-display font-bold text-2xl tabular-nums">{t.score}</span>
                <span className={`text-xs font-semibold tabular-nums ${delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-rose-700' : 'text-ink/40'}`}>
                  {delta === 0 ? '±0' : delta > 0 ? `+${delta}` : delta}
                </span>
              </div>
            </div>
            <Sparkline points={s?.pts ?? []} color={t.color} />
          </motion.div>
        )
      })}
    </section>
  )
}

function Sparkline({ points, color }) {
  if (points.length < 2) {
    return <div className="w-20 h-10 rounded-lg border-2 border-dashed border-ink/15" />
  }
  const W = 80, H = 36
  const scores = points.map(p => p.score)
  let min = Math.min(...scores), max = Math.max(...scores)
  if (min === max) { min -= 1; max += 1 }
  const x = (i) => (i / (points.length - 1)) * (W - 2) + 1
  const y = (v) => H - 2 - ((v - min) / (max - min)) * (H - 4)
  const d = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0">
      <path d={d} fill="none" stroke="#0F0F12" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* -------- activity log, grouped by day -------- */

function ActivityLog({ logs, teamMap, emailMap }) {
  if (logs.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="text-4xl mb-2">📜</div>
        <h3 className="font-display text-lg font-bold">Nothing in this window</h3>
        <p className="text-ink/60 text-sm mt-1">Try a longer range.</p>
      </div>
    )
  }
  const groups = useMemo(() => groupByDay(logs), [logs])

  return (
    <div className="overflow-y-auto max-h-[560px] lg:max-h-[640px]">
      {groups.map(group => (
        <div key={group.key}>
          <div className="sticky top-0 z-10 bg-cream/95 backdrop-blur border-b-2 border-ink/10 px-5 md:px-6 py-2 text-xs font-bold uppercase tracking-wider text-ink/60 flex items-center justify-between">
            <span>{group.label}</span>
            <span className="tabular-nums">{group.items.length}</span>
          </div>
          <ul className="divide-y-2 divide-ink/5">
            {group.items.map(l => {
              const t = teamMap[l.team_id]
              const pos = l.delta >= 0
              return (
                <motion.li
                  key={l.id}
                  layout
                  initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 px-5 md:px-6 py-3"
                >
                  <div className="w-2.5 h-10 rounded-full shrink-0" style={{ background: t?.color ?? '#ccc' }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-semibold truncate">{t?.name ?? 'Deleted team'}</div>
                    <div className="text-[11px] text-ink/55 truncate">
                      {formatTime(l.created_at)}
                      {l.user_id && (
                        <> · <span className="font-mono">{emailMap[l.user_id] ?? '…'}</span></>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-display font-bold text-lg tabular-nums leading-none ${pos ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {pos ? `+${l.delta}` : l.delta}
                    </div>
                    <div className="text-[11px] text-ink/50 tabular-nums mt-1">→ {l.new_score}</div>
                  </div>
                </motion.li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

/* -------- chart with crosshair tooltip -------- */

function ScoreGraph({ boundaries, series, hasData }) {
  const W = 900, H = 360, P = { l: 44, r: 16, t: 16, b: 28 }
  const svgRef = useRef(null)
  const [hoverIdx, setHoverIdx] = useState(null)

  const startTs = boundaries[0]
  const endTs   = boundaries[boundaries.length - 1] ?? startTs

  const allScores = series.flatMap(s => s.pts.map(p => p.score))
  let yMin = Math.min(0, ...allScores)
  let yMax = Math.max(0, ...allScores)
  if (yMin === yMax) { yMin -= 1; yMax += 1 }
  const yPad = Math.max(1, Math.round((yMax - yMin) * 0.08))
  yMin -= yPad; yMax += yPad

  const x = ts => P.l + (W - P.l - P.r) * ((ts - startTs) / (endTs - startTs || 1))
  const y = score => P.t + (H - P.t - P.b) * (1 - (score - yMin) / (yMax - yMin))

  const yTicks = niceTicks(yMin, yMax, 5)
  const xTicks = useMemo(() => {
    const maxTicks = 8
    const stride = Math.max(1, Math.ceil(boundaries.length / maxTicks))
    const ticks = []
    for (let i = 0; i < boundaries.length; i += stride) ticks.push(boundaries[i])
    if (ticks.length && ticks[ticks.length - 1] !== boundaries[boundaries.length - 1]) {
      ticks.push(boundaries[boundaries.length - 1])
    }
    return ticks
  }, [boundaries])

  const onPointer = (e) => {
    const svg = svgRef.current
    if (!svg || !boundaries.length) return
    const touch = e.touches?.[0]
    const cx = (touch ?? e).clientX
    const pt = svg.createSVGPoint()
    pt.x = cx; pt.y = 0
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const local = pt.matrixTransform(ctm.inverse())
    let bestI = 0, bestD = Infinity
    for (let i = 0; i < boundaries.length; i++) {
      const d = Math.abs(local.x - x(boundaries[i]))
      if (d < bestD) { bestD = d; bestI = i }
    }
    setHoverIdx(bestI)
  }
  const clearHover = () => setHoverIdx(null)

  const hover = hoverIdx != null ? {
    ts: boundaries[hoverIdx],
    rows: series.map(s => ({ team: s.team, score: s.pts[hoverIdx]?.score ?? 0 })),
  } : null

  // Tooltip position: clamp inside chart area, in viewBox units.
  const TIP_W = 180, TIP_H = 24 + series.length * 22 + 16
  let tipX = 0, tipY = P.t + 8
  if (hover) {
    const px = x(hover.ts)
    tipX = Math.min(W - P.r - TIP_W, Math.max(P.l + 8, px + 14))
    // if hover is on the right, swap to the left of the cursor for legibility
    if (px > W * 0.7) tipX = Math.max(P.l + 8, px - TIP_W - 14)
  }

  return (
    <div className="w-full overflow-x-auto -mx-1 px-1">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto touch-none select-none"
        style={{ minWidth: 560 }}
        onMouseMove={onPointer}
        onMouseLeave={clearHover}
        onTouchStart={onPointer}
        onTouchMove={onPointer}
        onTouchEnd={clearHover}
      >
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="#0F0F12" strokeOpacity={v === 0 ? 0.4 : 0.08} strokeDasharray={v === 0 ? '0' : '3 4'} />
            <text x={P.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#0F0F12" fillOpacity="0.6">{v}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <g key={i}>
            <line x1={x(t)} x2={x(t)} y1={H - P.b} y2={H - P.b + 4} stroke="#0F0F12" strokeOpacity="0.3" />
            <text x={x(t)} y={H - P.b + 16} textAnchor="middle" fontSize="11" fill="#0F0F12" fillOpacity="0.6">
              {formatTick(t, endTs - startTs)}
            </text>
          </g>
        ))}
        <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} stroke="#0F0F12" strokeWidth="2" />
        <line x1={P.l} x2={P.l}     y1={P.t}      y2={H - P.b} stroke="#0F0F12" strokeWidth="2" />

        {series.map(({ team, pts }) => {
          const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${x(p.ts).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ')
          return (
            <g key={team.id}>
              <motion.path d={d} fill="none" stroke="#0F0F12" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }} />
              <motion.path d={d} fill="none" stroke={team.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: 'easeOut' }} />
              {pts.map((p, i) => (
                <circle key={i} cx={x(p.ts)} cy={y(p.score)} r="4.5" fill={team.color} stroke="#0F0F12" strokeWidth="2" />
              ))}
            </g>
          )
        })}

        {hover && (
          <g pointerEvents="none">
            <line x1={x(hover.ts)} x2={x(hover.ts)} y1={P.t} y2={H - P.b} stroke="#0F0F12" strokeWidth="1.5" strokeDasharray="4 4" strokeOpacity="0.6" />
            {hover.rows.map(r => (
              <circle key={r.team.id} cx={x(hover.ts)} cy={y(r.score)} r="6.5" fill={r.team.color} stroke="#0F0F12" strokeWidth="2.5" />
            ))}
            <foreignObject x={tipX} y={tipY} width={TIP_W} height={TIP_H}>
              <div xmlns="http://www.w3.org/1999/xhtml" className="card-chunk bg-white p-3" style={{ boxShadow: '3px 3px 0 0 #0F0F12' }}>
                <div className="text-[11px] font-bold uppercase tracking-wider text-ink/50">
                  {formatTooltipDate(hover.ts, endTs - startTs)}
                </div>
                <div className="mt-1.5 space-y-1">
                  {hover.rows.map(r => (
                    <div key={r.team.id} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full border-2 border-ink shrink-0" style={{ background: r.team.color }} />
                        <span className="font-semibold truncate">{r.team.name}</span>
                      </div>
                      <span className="font-display font-bold tabular-nums">{r.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </foreignObject>
          </g>
        )}

        {!hasData && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontFamily="Space Grotesk" fontSize="22" fill="#0F0F12" fillOpacity="0.4">
            No point changes in this window
          </text>
        )}
      </svg>
    </div>
  )
}

/* -------- helpers -------- */

function computeSeries(teams, logs, since) {
  const now = Date.now()
  const rawStart = since ?? (logs.length ? new Date(logs[0].created_at).getTime() : now - 6 * DAY)
  const startDay = new Date(rawStart); startDay.setHours(0, 0, 0, 0)
  const todayMidnight = new Date(now); todayMidnight.setHours(0, 0, 0, 0)
  const todayEnd = todayMidnight.getTime() + DAY - 1
  const spanDays = Math.max(1, Math.round((todayMidnight.getTime() - startDay.getTime()) / DAY) + 1)
  const stride = (spanDays >= 90 ? 7 : 1) * DAY

  const boundaries = [todayEnd]
  let t = todayEnd - stride
  while (t >= startDay.getTime()) {
    boundaries.unshift(t)
    t -= stride
  }

  const series = teams.map(team => {
    const teamLogs = logs
      .filter(l => l.team_id === team.id)
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    let cur = teamLogs.length
      ? teamLogs[0].new_score - teamLogs[0].delta
      : team.score
    let i = 0
    const pts = boundaries.map(b => {
      while (i < teamLogs.length && new Date(teamLogs[i].created_at).getTime() <= b) {
        cur = teamLogs[i].new_score
        i++
      }
      return { ts: b, score: cur }
    })
    return { team, pts }
  })

  return { boundaries, series }
}

function computeStats(filteredLogs, teams, teamMap) {
  const leader = teams.length
    ? teams.reduce((best, t) => (t.score > (best?.score ?? -Infinity) ? t : best), null)
    : null
  let swing = null
  let net = 0
  for (const l of filteredLogs) {
    net += l.delta
    if (!swing || Math.abs(l.delta) > Math.abs(swing.delta)) swing = l
  }
  return {
    leader,
    events: filteredLogs.length,
    net,
    swing: swing ? { delta: swing.delta, teamName: teamMap[swing.team_id]?.name ?? 'Deleted team' } : null,
  }
}

function groupByDay(logs) {
  const ordered = [...logs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const groups = []
  const seen = new Map()
  for (const l of ordered) {
    const d = new Date(l.created_at)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    let g = seen.get(key)
    if (!g) {
      g = { key, date: d, label: relativeDayLabel(d), items: [] }
      seen.set(key, g)
      groups.push(g)
    }
    g.items.push(l)
  }
  return groups
}

function relativeDayLabel(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const that = new Date(d);  that.setHours(0, 0, 0, 0)
  const diff = Math.round((today - that) / DAY)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'long' })
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString([], sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' })
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

function formatTick(ts, span) {
  const d = new Date(ts)
  if (span <= 2 * DAY) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (span <= 90 * DAY) return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return d.toLocaleDateString([], { month: 'short', year: '2-digit' })
}

function formatTime(iso) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatTooltipDate(ts, span) {
  const d = new Date(ts)
  if (span <= 2 * DAY) return d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  if (span <= 90 * DAY) return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}
