import React, { useMemo, useState } from 'react'
import { Card, Icon, Money } from '../components/ui'
import { EquityChart, PnlBars, ScoreRadar } from '../components/charts'
import MonthCalendar from '../components/MonthCalendar'
import { useFilteredTrades, useStartBalance, useStore } from '../lib/store'
import { computeStats, dailyStats, net } from '../lib/stats'
import { cls, dayKey, dayKeyOf, MONTHS, money, num, pct, shortDate } from '../lib/format'
import { useNav } from '../nav'
import { sendToAssistant } from '../components/Assistant'

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

const Tile = ({ label, value, tone, right, children }: { label: string; value: React.ReactNode; tone?: number; right?: React.ReactNode; children?: React.ReactNode }) => (
  <div className="card">
    <div className="row between">
      <div>
        <div className="stat-label">{label}</div>
        <div className={cls('stat-value num', tone !== undefined && (tone > 0 ? 'pos' : tone < 0 ? 'neg' : ''))}>{value}</div>
      </div>
      {right}
    </div>
    {children}
  </div>
)
const grade = (v: number): [string, string] => (v >= 80 ? ['Excellent', 'pos'] : v >= 65 ? ['Good', 'pos'] : v >= 45 ? ['Fair', 'warn'] : ['Needs work', 'neg'])

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

  const today = dayKeyOf(new Date())
  const wk = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKeyOf(d) })()
  const mo = today.slice(0, 8) + '01'
  const sumFrom = (from: string) => s.days.filter((d) => d.date >= from).reduce((a, d) => a + d.net, 0)
  const todayNetAll = s.days.find((d) => d.date === today)?.net
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const tonePill = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : '')
  const last = s.days[s.days.length - 1]

  return (
    <>
      <div className="hero">
        <div className="row between wrap" style={{ alignItems: 'flex-start', gap: 20 }}>
          <div>
            <div className="hl">{hello} · Account balance</div>
            <div className="big num">{money(start + s.net)}</div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}><span className={tonePill(s.net)}>{s.net >= 0 ? '▲' : '▼'} {money(s.net)}</span> <span style={{ opacity: 0.7 }}>net · {pct(start ? (s.net / start) * 100 : 0, 2)} on {money(start, 0)}</span></div>
          </div>
          <div className="row wrap">
            <button className="btn sm" onClick={() => { sendToAssistant('סכם לי את היום האחרון'); nav.go('coach') }}><Icon name="spark" size={15} />Review last day</button>
            <button className="btn sm" onClick={() => nav.go('import')}><Icon name="upload" size={15} />Import</button>
          </div>
        </div>
        <div className="pillrow" style={{ marginTop: 20 }}>
          <div className="pill"><span className="hl">Today</span><b className={cls('num', todayNetAll !== undefined && tonePill(todayNetAll))}>{todayNetAll !== undefined ? money(todayNetAll) : 'No trades'}</b></div>
          <div className="pill"><span className="hl">This week</span><b className={cls('num', tonePill(sumFrom(wk)))}>{money(sumFrom(wk))}</b></div>
          <div className="pill"><span className="hl">This month</span><b className={cls('num', tonePill(sumFrom(mo)))}>{money(sumFrom(mo))}</b></div>
          <div className="pill"><span className="hl">Last session</span><b className={cls('num', last && tonePill(last.net))}>{last ? `${money(last.net)}` : '—'}</b></div>
          <div className="pill"><span className="hl">Streak</span><b className="num">{s.currentStreak > 0 ? `${s.currentStreak} win${s.currentStreak > 1 ? 's' : ''}` : s.currentStreak < 0 ? `${-s.currentStreak} loss${s.currentStreak < -1 ? 'es' : ''}` : '—'}</b></div>
        </div>
      </div>

      <div className="grid g5 kpis">
        <Tile label="Net P&L" value={money(s.net)} tone={s.net}><div className="stat-sub">{s.count} trades · {money(s.fees, 0)} fees</div></Tile>
        <Tile label="Trade win %" value={pct(s.winRate)} right={<Gauge wins={s.wins} losses={s.losses} />} />
        <Tile label="Profit factor" value={num(s.profitFactor)} right={<Ring share={s.grossProfit / (s.grossProfit + s.grossLoss || 1)} />} />
        <Tile label="Day win %" value={pct(s.dayWinRate)} right={<Gauge wins={s.winDays} losses={s.lossDays} />} />
        <Tile label="Avg win/loss trade" value={num(s.payoff)}>
          <div className="progress" style={{ marginTop: 10, background: 'var(--neg)' }}><div style={{ width: `${(s.avgWin / (s.avgWin + s.avgLoss || 1)) * 100}%`, background: 'var(--pos)', borderRadius: 0 }} /></div>
          <div className="row between num" style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}><span className="pos">{money(s.avgWin, 0)}</span><span className="neg">-{money(s.avgLoss, 0)}</span></div>
        </Tile>
      </div>

      <div className="grid g3">
        <Card title="Journal score" right={<span className={cls('chip', grade(s.score.total)[1])} style={{ fontWeight: 600 }}>{grade(s.score.total)[0]}</span>}>
          <ScoreRadar parts={s.score.parts} height={236} />
          <div className="score-foot">
            <div><div className="stat-label">Your score</div><div className="num score-num">{Math.round(s.score.total)}</div></div>
            <div className="grow">
              <div className="score-bar"><span style={{ left: `${s.score.total}%` }} /></div>
              <div className="row between faint num" style={{ fontSize: 11, marginTop: 6 }}><span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span></div>
            </div>
          </div>
        </Card>
        <Card title="Daily net cumulative P&L" right={<span className={cls('num', s.net >= 0 ? 'pos' : 'neg')} style={{ fontWeight: 700 }}>{money(s.net)}</span>}><EquityChart data={s.equity} start={start} height={290} /></Card>
        <Card title="Net daily P&L" right={<span className="muted">{s.winDays} green · {s.lossDays} red</span>}><PnlBars data={s.days.slice(-40).map((d) => ({ label: d.date, value: d.net, count: d.count }))} labelFmt={shortDate} height={290} /></Card>
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
