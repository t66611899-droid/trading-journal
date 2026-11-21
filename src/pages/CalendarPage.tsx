import React, { useMemo, useState } from 'react'
import { Card, Icon, Money, Seg, Stat } from '../components/ui'
import MonthCalendar, { monthCells } from '../components/MonthCalendar'
import { useFilteredTrades } from '../lib/store'
import { dailyStats } from '../lib/stats'
import { dayKeyOf, MONTHS, money, pct, shortDate } from '../lib/format'
import { useNav } from '../App'

export default function CalendarPage() {
  const trades = useFilteredTrades()
  const nav = useNav()
  const days = useMemo(() => dailyStats(trades), [trades])
  const [view, setView] = useState<'month' | 'year'>('month')
  const [cur, setCur] = useState(() => {
    const last = days.length ? days[days.length - 1].date : dayKeyOf(new Date())
    return { y: +last.slice(0, 4), m: +last.slice(5, 7) - 1 }
  })
  const shift = (n: number) => setCur(({ y, m }) => { const d = new Date(y, m + (view === 'year' ? n * 12 : n), 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const prefix = view === 'year' ? `${cur.y}-` : `${cur.y}-${String(cur.m + 1).padStart(2, '0')}`
  const scope = days.filter((d) => d.date.startsWith(prefix))
  const total = scope.reduce((s, d) => s + d.net, 0)
  const wins = scope.filter((d) => d.net > 0)
  const best = scope.length ? scope.reduce((a, b) => (b.net > a.net ? b : a)) : null
  const worst = scope.length ? scope.reduce((a, b) => (b.net < a.net ? b : a)) : null
  const map = useMemo(() => new Map(days.map((d) => [d.date, d])), [days])
  const maxAbs = Math.max(1, ...scope.map((d) => Math.abs(d.net)))

  return (
    <>
      <div className="page-head">
        <div className="row">
          <button className="btn sm" onClick={() => shift(-1)}><Icon name="left" size={16} /></button>
          <h2 style={{ minWidth: 150, textAlign: 'center' }}>{view === 'month' ? `${MONTHS[cur.m]} ${cur.y}` : cur.y}</h2>
          <button className="btn sm" onClick={() => shift(1)}><Icon name="right" size={16} /></button>
          <button className="btn ghost sm" onClick={() => { const d = new Date(); setCur({ y: d.getFullYear(), m: d.getMonth() }) }}>Today</button>
        </div>
        <Seg value={view} onChange={setView} options={[['month', 'Month'], ['year', 'Year']]} />
      </div>
      <div className="grid g5">
        <Stat label={view === 'month' ? 'Monthly net P&L' : 'Yearly net P&L'} value={money(total)} tone={total} sub={`${scope.reduce((s, d) => s + d.count, 0)} trades`} />
        <Stat label="Trading days" value={scope.length} sub={<><span className="pos">{wins.length} winning</span> · <span className="neg">{scope.filter((d) => d.net < 0).length} losing</span></>} />
        <Stat label="Day win %" value={pct(scope.length ? (wins.length / scope.length) * 100 : 0)} sub={`Daily average ${money(scope.length ? total / scope.length : 0, 0)}`} />
        <Stat label="Best day" value={best ? money(best.net, 0) : '—'} tone={best?.net} sub={best && shortDate(best.date)} />
        <Stat label="Worst day" value={worst ? money(worst.net, 0) : '—'} tone={worst?.net} sub={worst && shortDate(worst.date)} />
      </div>
      {view === 'month' ? (
        <Card><MonthCalendar year={cur.y} month={cur.m} days={days} onDay={nav.openDay} /></Card>
      ) : (
        <div className="year-grid">
          {MONTHS.map((name, m) => {
            const mp = `${cur.y}-${String(m + 1).padStart(2, '0')}`
            const md = days.filter((d) => d.date.startsWith(mp))
            const mNet = md.reduce((s, d) => s + d.net, 0)
            return (
              <Card key={m} title={<b style={{ cursor: 'pointer' }} onClick={() => { setCur({ y: cur.y, m }); setView('month') }}>{name}</b>}
                right={md.length ? <Money v={mNet} digits={0} /> : <span className="faint">—</span>}>
                <div className="mini">
                  {monthCells(cur.y, m).map((d, i) => {
                    const s = d.getMonth() === m ? map.get(dayKeyOf(d)) : undefined
                    const a = s ? 0.25 + 0.75 * Math.min(1, Math.abs(s.net) / maxAbs) : 1
                    return <i key={i} title={s ? `${dayKeyOf(d)}: ${money(s.net)}` : ''} onClick={() => s && nav.openDay(s.date)}
                      style={{ visibility: d.getMonth() === m ? 'visible' : 'hidden', cursor: s ? 'pointer' : 'default', background: s ? (s.net >= 0 ? 'var(--pos)' : 'var(--neg)') : undefined, opacity: a }} />
                  })}
                </div>
                <div className="stat-sub" style={{ marginTop: 8 }}>{md.length} trading days · {md.reduce((s, d) => s + d.count, 0)} trades</div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
