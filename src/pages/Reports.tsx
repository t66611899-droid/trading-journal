import React, { useMemo, useState } from 'react'
import { Card, Money } from '../components/ui'
import { DrawdownChart, EquityChart, groupBars, PnlBars } from '../components/charts'
import { useFilteredTrades, useStartBalance, useStore } from '../lib/store'
import { computeStats, DURATION_BUCKETS, durationBucket, groupBy, net, rMultiple, type Group } from '../lib/stats'
import { cls, compact, dayKey, duration, MONTHS, money, monthKey, num, pct, WEEKDAYS, WEEKDAYS_SHORT } from '../lib/format'
import { rootSymbol } from '../lib/instruments'
import type { Trade } from '../lib/types'

type Tab = 'overview' | 'hour' | 'weekday' | 'month' | 'symbol' | 'setup' | 'tags' | 'mistakes' | 'duration' | 'side' | 'r' | 'heat'
const NAV: [string, [Tab, string][]][] = [
  ['Summary', [['overview', 'Overview']]],
  ['Date & time', [['weekday', 'Days'], ['month', 'Months'], ['hour', 'Trade time'], ['duration', 'Trade duration'], ['heat', 'Day × hour heatmap']]],
  ['Instruments', [['symbol', 'Symbols'], ['side', 'Long vs short']]],
  ['Strategy', [['setup', 'Playbooks'], ['tags', 'Tags'], ['mistakes', 'Mistakes']]],
  ['Risk', [['r', 'R-multiple']]],
]

function GroupTable({ groups, first }: { groups: Group[]; first: string }) {
  const max = Math.max(1, ...groups.map((g) => Math.abs(g.net)))
  return (
    <div className="table-wrap">
      <table className="t">
        <thead><tr><th>{first}</th><th className="r">Trades</th><th className="r">Win %</th><th className="r">Net P&L</th><th></th><th className="r">Avg trade</th><th className="r">Avg win</th><th className="r">Avg loss</th><th className="r">Profit factor</th></tr></thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key}>
              <td><b>{g.label}</b></td>
              <td className="r num">{g.count}</td>
              <td className="r num">{pct(g.winRate)}</td>
              <td className="r"><b><Money v={g.net} /></b></td>
              <td><div className="bar-cell"><div style={{ width: `${(Math.abs(g.net) / max) * 100}%`, background: g.net >= 0 ? 'var(--pos)' : 'var(--neg)' }} /></div></td>
              <td className="r"><Money v={g.avg} /></td>
              <td className="r"><Money v={g.avgWin} /></td>
              <td className="r"><Money v={g.avgLoss} /></td>
              <td className="r num">{num(g.profitFactor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GroupReport({ title, first, groups, chartSort }: { title: string; first: string; groups: Group[]; chartSort?: boolean }) {
  if (!groups.length) return <Card><div className="empty">No data for this report</div></Card>
  const best = groups.reduce((a, b) => (b.net > a.net ? b : a))
  const worst = groups.reduce((a, b) => (b.net < a.net ? b : a))
  const top = groups.filter((g) => g.count >= 3).sort((a, b) => b.winRate - a.winRate)[0]
  const tile = (label: string, g: Group | undefined, sub: React.ReactNode) => (
    <div className="card"><div className="stat-label">{label}</div><div className="stat-value" style={{ fontSize: 19 }}>{g?.label ?? '—'}</div><div className="stat-sub">{g ? sub : ''}</div></div>
  )
  return (
    <>
      <div className="grid g3">
        {tile('Best performing', best, <><Money v={best.net} /> · {best.count} trades</>)}
        {tile('Least performing', worst, <><Money v={worst.net} /> · {worst.count} trades</>)}
        {tile('Highest win rate', top, top && <>{pct(top.winRate)} · {top.count} trades</>)}
      </div>
      <Card title={title}><PnlBars data={groupBars(chartSort ? [...groups].sort((a, b) => b.net - a.net).slice(0, 25) : groups)} height={280} /></Card>
      <Card style={{ padding: 0, overflow: 'hidden' }}><GroupTable groups={groups} first={first} /></Card>
    </>
  )
}

function Heatmap({ trades }: { trades: Trade[] }) {
  const cells = new Map<string, { net: number; count: number }>()
  const hours = new Set<number>()
  for (const t of trades) {
    const d = new Date(t.entryTime)
    const k = `${d.getDay()}-${d.getHours()}`
    hours.add(d.getHours())
    const c = cells.get(k) ?? { net: 0, count: 0 }
    c.net += net(t); c.count++
    cells.set(k, c)
  }
  const hs = [...hours].sort((a, b) => a - b)
  const max = Math.max(1, ...[...cells.values()].map((c) => Math.abs(c.net)))
  const wds = [0, 1, 2, 3, 4, 5, 6].filter((w) => hs.some((h) => cells.has(`${w}-${h}`)))
  return (
    <Card title="Net P&L by weekday and entry hour">
      <div className="heat" style={{ gridTemplateColumns: `48px repeat(${hs.length}, minmax(40px, 1fr))` }}>
        <div />
        {hs.map((h) => <div key={h} className="hl">{String(h).padStart(2, '0')}:00</div>)}
        {wds.map((w) => (
          <React.Fragment key={w}>
            <div className="hl">{WEEKDAYS_SHORT[w]}</div>
            {hs.map((h) => {
              const c = cells.get(`${w}-${h}`)
              const a = c ? 0.15 + 0.7 * (Math.abs(c.net) / max) : 0
              return <div key={h} className="hc num" title={c ? `${WEEKDAYS[w]} ${h}:00 — ${money(c.net)} · ${c.count} trades` : ''}
                style={c ? { background: c.net >= 0 ? `rgba(30,185,128,${a})` : `rgba(239,74,95,${a})` } : undefined}>{c ? compact(c.net) : ''}</div>
            })}
          </React.Fragment>
        ))}
      </div>
    </Card>
  )
}

function Insights({ trades }: { trades: Trade[] }) {
  const items = useMemo(() => {
    const out: { tone: 'pos' | 'neg' | 'warn'; text: React.ReactNode }[] = []
    const enough = (g: Group) => g.count >= 5
    const hours = groupBy(trades, (t) => String(new Date(t.entryTime).getHours()), (k) => `${k.padStart(2, '0')}:00–${String(+k + 1).padStart(2, '0')}:00`).filter(enough)
    const wds = groupBy(trades, (t) => String(new Date(t.entryTime).getDay()), (k) => WEEKDAYS[+k]).filter(enough)
    const pick = (gs: Group[], what: string) => {
      if (gs.length < 2) return
      const b = gs.reduce((a, c) => (c.net > a.net ? c : a)), w = gs.reduce((a, c) => (c.net < a.net ? c : a))
      if (b.net > 0) out.push({ tone: 'pos', text: <>Your best {what} is <b>{b.label}</b>: {money(b.net, 0)} net, {pct(b.winRate, 0)} win rate over {b.count} trades.</> })
      if (w.net < 0) out.push({ tone: 'neg', text: <>Your worst {what} is <b>{w.label}</b>: {money(w.net, 0)} net over {w.count} trades.</> })
    }
    pick(hours, 'hour'); pick(wds, 'day')
    const mis = groupBy(trades, (t) => t.mistakes).sort((a, b) => a.net - b.net)
    if (mis[0] && mis[0].net < 0) out.push({ tone: 'neg', text: <>Most expensive mistake: <b>{mis[0].label}</b> cost you {money(Math.abs(mis[0].net), 0)} across {mis[0].count} trades.</> })
    // Performance after two consecutive losses on the same day ("tilt").
    const byDay = new Map<string, Trade[]>()
    for (const t of [...trades].sort((a, b) => a.entryTime.localeCompare(b.entryTime))) { const k = dayKey(t.entryTime); byDay.set(k, [...(byDay.get(k) || []), t]) }
    const after: Trade[] = []
    for (const ts of byDay.values()) { let l = 0; for (const t of ts) { if (l >= 2) after.push(t); l = net(t) < 0 ? l + 1 : 0 } }
    if (after.length >= 5) {
      const an = after.reduce((s, t) => s + net(t), 0)
      const wr = (after.filter((t) => net(t) > 0).length / after.length) * 100
      out.push({ tone: an < 0 ? 'neg' : 'pos', text: <>After two losses in a row on the same day: {after.length} trades, {pct(wr, 0)} win rate, <b>{money(an, 0)}</b> total.</> })
    }
    return out.slice(0, 4)
  }, [trades])
  if (!items.length) return null
  return (
    <Card title="Insights">
      <div className="grid g2" style={{ gap: 10 }}>
        {items.map((it, i) => <div key={i} className="insight"><span className="dot" style={{ background: `var(--${it.tone})` }} /><span>{it.text}</span></div>)}
      </div>
    </Card>
  )
}

export default function Reports() {
  const trades = useFilteredTrades()
  const start = useStartBalance()
  const playbooks = useStore((s) => s.playbooks)
  const [tab, setTab] = useState<Tab>('overview')
  const s = useMemo(() => computeStats(trades, start), [trades, start])
  const body = useMemo(() => {
    const byKey = (a: Group, b: Group) => +a.key - +b.key
    switch (tab) {
      case 'hour': return <GroupReport title="Net P&L by entry hour" first="Hour" groups={groupBy(trades, (t) => String(new Date(t.entryTime).getHours()), (k) => `${k.padStart(2, '0')}:00`).sort(byKey)} />
      case 'weekday': return <GroupReport title="Net P&L by day of week" first="Day" groups={groupBy(trades, (t) => String(new Date(t.exitTime).getDay()), (k) => WEEKDAYS[+k]).sort(byKey)} />
      case 'month': return <GroupReport title="Net P&L by month" first="Month" groups={groupBy(trades, (t) => monthKey(t.exitTime), (k) => `${MONTHS[+k.slice(5) - 1].slice(0, 3)} ${k.slice(0, 4)}`).sort((a, b) => a.key.localeCompare(b.key))} />
      case 'symbol': return <GroupReport chartSort title="Net P&L by symbol" first="Symbol" groups={groupBy(trades, (t) => rootSymbol(t.symbol)).sort((a, b) => b.net - a.net)} />
      case 'setup': return <GroupReport chartSort title="Net P&L by playbook" first="Playbook" groups={groupBy(trades, (t) => t.setupId ?? '-', (k) => playbooks.find((p) => p.id === k)?.name ?? 'No playbook').sort((a, b) => b.net - a.net)} />
      case 'tags': return <GroupReport chartSort title="Net P&L by tag" first="Tag" groups={groupBy(trades, (t) => t.tags).sort((a, b) => b.net - a.net)} />
      case 'mistakes': return <GroupReport chartSort title="Cost of mistakes" first="Mistake" groups={groupBy(trades, (t) => (t.mistakes.length ? t.mistakes : ['No mistake'])).sort((a, b) => a.net - b.net)} />
      case 'duration': return <GroupReport title="Net P&L by trade duration" first="Duration" groups={groupBy(trades, durationBucket).sort((a, b) => DURATION_BUCKETS.indexOf(a.key) - DURATION_BUCKETS.indexOf(b.key))} />
      case 'side': return <GroupReport title="Long vs short" first="Side" groups={groupBy(trades, (t) => t.side, (k) => (k === 'long' ? 'Long' : 'Short'))} />
      case 'heat': return <Heatmap trades={trades} />
      case 'r': {
        const rs = trades.map(rMultiple).filter((x): x is number => x !== null)
        if (!rs.length) return <Card><div className="empty">No trades have a planned risk (1R) yet. Add a stop or risk amount to your trades to see the R distribution.</div></Card>
        const buckets = new Map<number, number>()
        rs.forEach((r) => { const b = Math.max(-3, Math.min(5, Math.floor(r * 2) / 2)); buckets.set(b, (buckets.get(b) || 0) + 1) })
        const data = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([b, c]) => ({ label: `${b}R`, value: b >= 0 ? c : -c, count: c }))
        return <Card title="Trade count by R-multiple" right={<span className="muted">Avg {num(s.avgR)}R · {rs.length} trades</span>}><PnlBars data={data} height={300} money={false} /></Card>
      }
      default: return null
    }
  }, [tab, trades, playbooks, s])

  const kv = (label: string, value: React.ReactNode) => <div className="kv"><span>{label}</span><span className="num">{value}</span></div>
  return (
    <div className="rep">
      <nav className="rep-nav">
        {NAV.map(([group, items]) => (
          <React.Fragment key={group}>
            <div className="grp">{group}</div>
            {items.map(([t, label]) => <button key={t} className={cls(tab === t && 'on')} onClick={() => setTab(t)}>{label}</button>)}
          </React.Fragment>
        ))}
      </nav>
      <div className="rep-body">
        {!trades.length ? <Card><div className="empty">No trades in this range</div></Card> : tab !== 'overview' ? body : (
          <>
            <Card title="Your stats" right={<span className="muted">{s.count} trades · {s.tradingDays} trading days</span>}>
              <div className="stat-cols">
                <div>
                  {kv('Net P&L', <Money v={s.net} />)}{kv('Total fees', money(s.fees))}{kv('Profit factor', num(s.profitFactor))}
                  {kv('Trade expectancy', <Money v={s.expectancy} />)}{kv('Average R', s.rCount ? `${num(s.avgR)}R` : '—')}
                  {kv('Max drawdown', <Money v={-s.maxDrawdown} />)}{kv('Recovery factor', num(s.recoveryFactor))}
                </div>
                <div>
                  {kv('Win rate', pct(s.winRate))}{kv('Wins / losses / BE', `${s.wins} / ${s.losses} / ${s.be}`)}
                  {kv('Average win', <Money v={s.avgWin} />)}{kv('Average loss', <Money v={-s.avgLoss} />)}
                  {kv('Largest win', <Money v={s.largestWin} />)}{kv('Largest loss', <Money v={s.largestLoss} />)}
                  {kv('Max win / loss streak', `${s.maxConsecWins} / ${s.maxConsecLosses}`)}
                </div>
                <div>
                  {kv('Winning days', `${s.winDays} of ${s.tradingDays} (${pct(s.dayWinRate, 0)})`)}{kv('Average daily P&L', <Money v={s.avgDaily} />)}
                  {kv('Average winning day', <Money v={s.avgWinDay} />)}{kv('Average losing day', <Money v={s.avgLossDay} />)}
                  {kv('Average monthly P&L', <Money v={s.avgMonthly} />)}{kv('Yearly run rate', <Money v={s.avgYearly} />)}
                  {kv('Avg hold: winners / losers', `${duration(s.avgHoldWin)} / ${duration(s.avgHoldLoss)}`)}
                </div>
              </div>
            </Card>
            <div className="grid g2">
              <Card title="Daily net cumulative P&L"><EquityChart data={s.equity} start={start} height={240} /></Card>
              <Card title="Drawdown"><DrawdownChart data={s.equity} height={240} /></Card>
            </div>
            <Insights trades={trades} />
          </>
        )}
      </div>
    </div>
  )
}
