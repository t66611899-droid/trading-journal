import React, { useMemo, useState } from 'react'
import { Card, Icon, Money } from '../components/ui'
import { EquityChart, PnlBars, ScoreRadar } from '../components/charts'
import MonthCalendar from '../components/MonthCalendar'
import { useFilteredTrades, useStartBalance, useStore } from '../lib/store'
import { computeStats, dailyStats, net } from '../lib/stats'
import { cls, dayKey, dayKeyOf, MONTHS, money, num, pct, shortDate } from '../lib/format'
import { useNav } from '../nav'

/** Half-donut: green share = wins, red share = losses. */
function Gauge({ wins, losses }: { wins: number; losses: number }) {
  const r = 30, len = Math.PI * r, total = wins + losses || 1
  const arc = `M 6 38 A ${r} ${r} 0 0 1 66 38`
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={72} height={42} viewBox="0 0 72 42">
        <path d={arc} fill="none" stroke="var(--neg)" strokeWidth={7} strokeLinecap="round" />
        {wins > 0 && <path d={arc} fill="none" stroke="var(--pos)" strokeWidth={7} strokeLinecap="round" strokeDasharray={`${(wins / total) * len} ${len}`} />}
      </svg>
      <div className="row between num" style={{ fontSize: 11.5, fontWeight: 600, marginTop: -2 }}><span className="pos">{wins}</span><span className="neg">{losses}</span></div>
    </div>
  )
}
function Ring({ share }: { share: number }) {
  const r = 22, c = 2 * Math.PI * r
  return (
    <svg width={56} height={56} viewBox="0 0 56 56">
      <circle cx={28} cy={28} r={r} fill="none" stroke="var(--neg)" strokeWidth={7} />
      <circle cx={28} cy={28} r={r} fill="none" stroke="var(--pos)" strokeWidth={7} strokeDasharray={`${Math.min(1, share) * c} ${c}`} transform="rotate(-90 28 28)" />
    </svg>
  )
}

const row = (label: string, value: React.ReactNode) => <div className="kv"><span>{label}</span><span className="num">{value}</span></div>

/** A stat tile. Hovering (or tapping) it reveals a small card with what the number is made of. */
function Tile({ label, value, tone, right, children, about, details, alignRight }: {
  label: string; value: React.ReactNode; tone?: number; right?: React.ReactNode; children?: React.ReactNode
  about: string; details: React.ReactNode; alignRight?: boolean
}) {
  return (
    <div className="card tile" tabIndex={0}>
      <div className="row between">
        <div>
          <div className="stat-label">{label}</div>
          <div className={cls('stat-value num', tone !== undefined && (tone > 0 ? 'pos' : tone < 0 ? 'neg' : ''))}>{value}</div>
        </div>
        {right}
      </div>
      {children}
      <div className={cls('hover-card', alignRight && 'right')}>
        <div className="hc-title">{label}</div>
        <div className="hc-sub">{about}</div>
        {details}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const trades = useFilteredTrades()
  const start = useStartBalance()
  const accounts = useStore((s) => s.accounts)
  const accountId = useStore((s) => s.filters.accountId)
  const allTrades = useStore((s) => s.trades)
  const nav = useNav()
  const s = useMemo(() => computeStats(trades, start), [trades, start])
  const [cur, setCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const monthDays = s.days.filter((d) => d.date.startsWith(`${cur.y}-${String(cur.m + 1).padStart(2, '0')}`))
  const monthNet = monthDays.reduce((a, d) => a + d.net, 0)
  const shift = (n: number) => setCur(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const recent = [...trades].reverse().slice(0, 9)
  const propAccounts = accounts.filter((a) => (accountId === 'all' || a.id === accountId) && (a.profitTarget || a.maxDailyLoss || a.maxDrawdown))

  if (!trades.length)
    return (
      <Card>
        <div className="empty">
          <h2 style={{ color: 'var(--text)' }}>No trades in this range yet</h2>
          <p>Add a trade manually or import a file from your broker to start analyzing.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => nav.openTrade('new')}><Icon name="plus" size={16} />Add trade</button>
            <button className="btn" onClick={() => nav.go('import')}><Icon name="upload" size={16} />Import trades</button>
          </div>
        </div>
      </Card>
    )

  return (
    <>
      <div className="grid g5">
        <Tile label="Net P&L" value={money(s.net)} tone={s.net} about="What you kept after commissions and fees."
          details={<>{row('Gross P&L', <Money v={s.gross} />)}{row('Fees', <Money v={-s.fees} plain />)}{row('Net P&L', <b><Money v={s.net} /></b>)}{row('Average per trade', <Money v={s.expectancy} />)}</>}>
          <div className="stat-sub">{s.count} trades</div>
        </Tile>
        <Tile label="Trade win %" value={pct(s.winRate)} right={<Gauge wins={s.wins} losses={s.losses} />} about="Winning trades out of all trades that ended in a win or a loss."
          details={<>{row('Winners', <span className="pos">{s.wins}</span>)}{row('Losers', <span className="neg">{s.losses}</span>)}{s.be > 0 && row('Breakeven', s.be)}{row('Win rate', `${s.wins} of ${s.wins + s.losses}`)}</>} />
        <Tile label="Profit factor" value={num(s.profitFactor)} right={<Ring share={s.grossProfit / (s.grossProfit + s.grossLoss || 1)} />} about="Dollars won for every dollar lost. Above 1.0 is profitable; 2.0 or more is strong."
          details={<>{row('Total won', <Money v={s.grossProfit} />)}{row('Total lost', <Money v={-s.grossLoss} />)}{row('Won ÷ lost', <b>{num(s.profitFactor)}</b>)}</>} />
        <Tile alignRight label="Day win %" value={pct(s.dayWinRate)} right={<Gauge wins={s.winDays} losses={s.lossDays} />} about="Trading days that ended green."
          details={<>{row('Winning days', <span className="pos">{s.winDays}</span>)}{row('Losing days', <span className="neg">{s.lossDays}</span>)}{row('Avg winning day', <Money v={s.avgWinDay} />)}{row('Avg losing day', <Money v={s.avgLossDay} />)}</>} />
        <Tile alignRight label="Avg win/loss trade" value={num(s.payoff)} about="Your average winner compared with your average loser."
          details={<>{row('Average winner', <Money v={s.avgWin} />)}{row('Average loser', <Money v={-s.avgLoss} />)}{row('Win rate needed to break even', isFinite(s.payoff) && s.payoff > 0 ? pct(100 / (1 + s.payoff)) : '—')}{row('Your win rate', pct(s.winRate))}</>}>
          <div className="progress" style={{ marginTop: 10, background: 'var(--neg)' }}><div style={{ width: `${(s.avgWin / (s.avgWin + s.avgLoss || 1)) * 100}%`, background: 'var(--pos)', borderRadius: 0 }} /></div>
          <div className="row between num" style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}><span className="pos">{money(s.avgWin, 0)}</span><span className="neg">-{money(s.avgLoss, 0)}</span></div>
        </Tile>
      </div>

      <div className="grid g3">
        <Card title={<span className="row" style={{ gap: 8 }}>Journal score
          <span className="hover-host"><span className="info-dot">i</span>
            <span className="hover-card" style={{ width: 290, fontWeight: 400 }}>
              <div className="hc-title">How the score is built</div>
              <div className="hc-sub">Six parts, each scored 0–100. Hover a point on the chart to see one part.</div>
              {s.score.parts.map((p) => (
                <div key={p.name} className="row" style={{ gap: 8, padding: '4px 0' }}>
                  <span style={{ width: 92 }}>{p.name}</span>
                  <div className="bar-cell grow" style={{ minWidth: 0 }}><div style={{ width: `${p.value}%`, background: p.value >= 66 ? 'var(--pos)' : p.value >= 33 ? 'var(--warn)' : 'var(--neg)' }} /></div>
                  <span className="num" style={{ width: 24, textAlign: 'right' }}>{Math.round(p.value)}</span>
                </div>
              ))}
            </span>
          </span>
        </span>}>
          <ScoreRadar parts={s.score.parts} height={210} />
          <div className="row" style={{ gap: 14, marginTop: 6 }}>
            <div><div className="stat-label">Your score</div><b className="num" style={{ fontSize: 22 }}>{Math.round(s.score.total)}</b></div>
            <div className="grow">
              <div className="progress" style={{ background: 'linear-gradient(90deg, var(--neg), var(--warn), var(--pos))', position: 'relative', overflow: 'visible' }}>
                <span style={{ position: 'absolute', left: `calc(${s.score.total}% - 6px)`, top: -3, width: 12, height: 12, borderRadius: '50%', background: 'var(--panel)', border: '3px solid var(--text)' }} />
              </div>
              <div className="row between faint" style={{ fontSize: 11, marginTop: 4 }}><span>0</span><span>50</span><span>100</span></div>
            </div>
          </div>
        </Card>
        <Card title="Daily net cumulative P&L"><EquityChart data={s.equity} start={start} height={270} /></Card>
        <Card title="Net daily P&L"><PnlBars data={s.days.slice(-40).map((d) => ({ label: d.date, value: d.net, count: d.count }))} labelFmt={shortDate} height={270} /></Card>
      </div>

      <div className="grid g12">
        <Card title="Recent trades" right={<button className="btn ghost sm" onClick={() => nav.go('trades')}>View all</button>} style={{ paddingBottom: 6 }}>
          <div style={{ margin: '0 -18px' }}>
            <table className="t">
              <thead><tr><th>Close date</th><th>Symbol</th><th className="r">Net P&L</th></tr></thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id} className="click" onClick={() => nav.openTrade(t.id)}>
                    <td className="muted">{shortDate(dayKey(t.exitTime))}</td>
                    <td><b>{t.symbol}</b> <span className={cls('chip', t.side === 'long' ? 'pos' : 'neg')} style={{ marginLeft: 6 }}>{t.side === 'long' ? 'Long' : 'Short'}</span></td>
                    <td className="r"><b><Money v={net(t)} /></b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title={<span className="row" style={{ gap: 4 }}>
          <button className="btn ghost sm" onClick={() => shift(-1)}><Icon name="left" size={16} /></button>
          <span style={{ minWidth: 118, textAlign: 'center' }}>{MONTHS[cur.m]} {cur.y}</span>
          <button className="btn ghost sm" onClick={() => shift(1)}><Icon name="right" size={16} /></button>
        </span>} right={<span className="muted">Monthly: <b><Money v={monthNet} digits={0} /></b> · {monthDays.length} days</span>}>
          <MonthCalendar year={cur.y} month={cur.m} days={s.days} onDay={nav.openDay} compact />
        </Card>
      </div>

      {propAccounts.map((a) => {
        const at = allTrades.filter((t) => t.accountId === a.id)
        const as = computeStats(at, a.startBalance)
        const balance = a.startBalance + as.net
        const todayNet = dailyStats(at).find((d) => d.date === dayKeyOf(new Date()))?.net ?? 0
        const bar = (label: string, used: number, limit: number, good: boolean, note?: string) => (
          <div className="grow" style={{ minWidth: 240 }}>
            <div className="row between"><span className="muted">{label}</span><span className="num"><b>{money(used, 0)}</b> / {money(limit, 0)}</span></div>
            <div className="progress" style={{ marginTop: 6 }}><div style={{ width: `${Math.max(0, Math.min(100, (used / limit) * 100))}%`, background: good ? 'var(--pos)' : used / limit > 0.7 ? 'var(--neg)' : 'var(--warn)' }} /></div>
            {note && <div className="stat-sub" style={{ marginTop: 5 }}>{note}</div>}
          </div>
        )
        return (
          <Card key={a.id} title={`Account rules — ${a.name}`} right={<span className="muted">Balance <b className="num" style={{ color: 'var(--text)' }}>{money(balance)}</b></span>}>
            <div className="row wrap" style={{ gap: 28, alignItems: 'flex-start' }}>
              {a.profitTarget ? bar('Profit target', Math.max(0, as.net), a.profitTarget, true, `${money(Math.max(0, a.profitTarget - as.net), 0)} to go`) : null}
              {a.maxDailyLoss ? bar('Daily loss today', Math.max(0, -todayNet), a.maxDailyLoss, false, `${money(a.maxDailyLoss - Math.max(0, -todayNet), 0)} left today`) : null}
              {a.maxDrawdown ? bar('Trailing drawdown used', as.currentDrawdown, a.maxDrawdown, false,
                `Peak ${money(as.peakBalance, 0)} · account floor ${money(as.peakBalance - a.maxDrawdown, 0)} · ${money(a.maxDrawdown - as.currentDrawdown, 0)} of room`) : null}
            </div>
          </Card>
        )
      })}
    </>
  )
}
