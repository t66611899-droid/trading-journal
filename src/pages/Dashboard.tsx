import React, { useMemo, useState } from 'react'
import { Card, Icon, Modal, Money } from '../components/ui'
import { EquityChart, PnlBars, ScoreRadar } from '../components/charts'
import MonthCalendar from '../components/MonthCalendar'
import { useFilteredTrades, useStartBalance, useStore } from '../lib/store'
import { computeStats, dailyStats, net, outcome, type Stats } from '../lib/stats'
import { cls, dateLong, dateTime, dayKey, dayKeyOf, MONTHS, money, num, pct, shortDate } from '../lib/format'
import type { Trade } from '../lib/types'
import { useNav } from '../nav'

type Detail = 'net' | 'win' | 'pf' | 'day' | 'payoff' | 'score'

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
const Tile = ({ label, value, tone, right, children, onClick }: { label: string; value: React.ReactNode; tone?: number; right?: React.ReactNode; children?: React.ReactNode; onClick: () => void }) => (
  <div className="card tile" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
    <div className="row between">
      <div>
        <div className="stat-label">{label}</div>
        <div className={cls('stat-value num', tone !== undefined && (tone > 0 ? 'pos' : tone < 0 ? 'neg' : ''))}>{value}</div>
      </div>
      {right}
    </div>
    {children}
    <span className="more">Details →</span>
  </div>
)

const kv = (label: string, value: React.ReactNode) => <div className="kv"><span>{label}</span><span className="num">{value}</span></div>
const explain = (text: string) => <p className="muted" style={{ margin: '0 0 14px' }}>{text}</p>

function TradeList({ trades, onOpen }: { trades: Trade[]; onOpen: (id: string) => void }) {
  if (!trades.length) return <div className="muted">None</div>
  return (
    <div className="table-wrap" style={{ border: '1px solid var(--line)', borderRadius: 10, maxHeight: 300, overflowY: 'auto' }}>
      <table className="t">
        <thead><tr><th>Opened</th><th>Symbol</th><th>Side</th><th className="r">Gross</th><th className="r">Fees</th><th className="r">Net P&L</th></tr></thead>
        <tbody>
          {trades.map((t) => (
            <tr key={t.id} className="click" onClick={() => onOpen(t.id)}>
              <td className="num">{dateTime(t.entryTime)}</td><td><b>{t.symbol}</b></td><td>{t.side === 'long' ? 'Long' : 'Short'}</td>
              <td className="r"><Money v={t.pnl} plain /></td><td className="r num">{money(t.fees)}</td><td className="r"><b><Money v={net(t)} /></b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** What is behind each dashboard number: the formula, the inputs, and the trades or days it is built from. */
function DetailModal({ kind, s, trades, onClose }: { kind: Detail; s: Stats; trades: Trade[]; onClose: () => void }) {
  const nav = useNav()
  const open = (id: string) => { onClose(); nav.openTrade(id) }
  const recent = [...trades].reverse()
  const wins = recent.filter((t) => outcome(t) === 'win'), losses = recent.filter((t) => outcome(t) === 'loss')
  const titles: Record<Detail, string> = { net: 'Net P&L', win: 'Trade win %', pf: 'Profit factor', day: 'Day win %', payoff: 'Avg win/loss trade', score: 'Journal score' }
  const section = (t: string) => <div className="section-title" style={{ margin: '16px 0 8px' }}>{t}</div>
  let body: React.ReactNode
  if (kind === 'net') body = <>
    {explain('What you actually kept: the gross result of every trade minus commissions and fees.')}
    {kv('Gross P&L', <Money v={s.gross} />)}{kv('Commissions & fees', <Money v={-s.fees} plain />)}{kv('Net P&L', <b><Money v={s.net} /></b>)}
    {kv('Trades', s.count)}{kv('Average per trade', <Money v={s.expectancy} />)}
    {section('All trades')}<TradeList trades={recent} onOpen={open} />
  </>
  else if (kind === 'win') body = <>
    {explain('Winning trades as a share of all trades that ended in a win or a loss (after fees).')}
    {kv('Winning trades', s.wins)}{kv('Losing trades', s.losses)}{kv('Breakeven trades', s.be)}{kv('Win rate', `${s.wins} ÷ ${s.wins + s.losses} = ${pct(s.winRate)}`)}
    {section(`Winners (${wins.length})`)}<TradeList trades={wins} onOpen={open} />
    {section(`Losers (${losses.length})`)}<TradeList trades={losses} onOpen={open} />
  </>
  else if (kind === 'pf') body = <>
    {explain('How many dollars you win for every dollar you lose. Above 1.0 you are profitable; 1.5 is solid and 2.0 or more is strong.')}
    {kv('Total won (all winning trades)', <Money v={s.grossProfit} />)}{kv('Total lost (all losing trades)', <Money v={-s.grossLoss} />)}
    {kv('Profit factor', `${money(s.grossProfit)} ÷ ${money(s.grossLoss)} = ${num(s.profitFactor)}`)}
    {section(`Winners (${wins.length})`)}<TradeList trades={wins} onOpen={open} />
    {section(`Losers (${losses.length})`)}<TradeList trades={losses} onOpen={open} />
  </>
  else if (kind === 'day') body = <>
    {explain('Trading days that ended green as a share of all trading days.')}
    {kv('Winning days', s.winDays)}{kv('Losing days', s.lossDays)}{kv('Day win rate', `${s.winDays} ÷ ${s.tradingDays} = ${pct(s.dayWinRate)}`)}
    {kv('Average winning day', <Money v={s.avgWinDay} />)}{kv('Average losing day', <Money v={s.avgLossDay} />)}
    {section('All trading days')}
    <div className="table-wrap" style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
      <table className="t">
        <thead><tr><th>Day</th><th className="r">Trades</th><th className="r">Won / lost</th><th className="r">Net P&L</th></tr></thead>
        <tbody>{[...s.days].reverse().map((d) => (
          <tr key={d.date} className="click" onClick={() => { onClose(); nav.openDay(d.date) }}>
            <td>{dateLong(d.date)}</td><td className="r num">{d.count}</td><td className="r num">{d.wins} / {d.losses}</td><td className="r"><b><Money v={d.net} /></b></td>
          </tr>))}</tbody>
      </table>
    </div>
  </>
  else if (kind === 'payoff') body = <>
    {explain('The size of your average winner compared with your average loser. The higher it is, the lower the win rate you need to make money.')}
    {kv('Average winning trade', <Money v={s.avgWin} />)}{kv('Average losing trade', <Money v={-s.avgLoss} />)}
    {kv('Ratio', `${money(s.avgWin)} ÷ ${money(s.avgLoss)} = ${num(s.payoff)}`)}
    {kv('Win rate needed to break even', isFinite(s.payoff) && s.payoff > 0 ? pct(100 / (1 + s.payoff)) : '—')}{kv('Your win rate', pct(s.winRate))}
    {kv('Largest win', <Money v={s.largestWin} />)}{kv('Largest loss', <Money v={s.largestLoss} />)}
  </>
  else body = <>
    {explain('One number from 0 to 100 that sums up six sides of your trading. Each part is scored 0–100 and weighted; the weights add up to 100%.')}
    <div className="table-wrap" style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
      <table className="t">
        <thead><tr><th>Part</th><th>Your value</th><th style={{ width: 150 }}>Score</th><th className="r">Weight</th><th className="r">Points</th></tr></thead>
        <tbody>
          {s.score.parts.map((p) => (
            <tr key={p.name}>
              <td style={{ whiteSpace: 'normal' }}><b>{p.name}</b><div className="muted" style={{ fontSize: 12 }}>{p.how}</div></td>
              <td className="num">{p.raw}</td>
              <td><div className="row" style={{ gap: 8 }}><div className="bar-cell grow"><div style={{ width: `${p.value}%`, background: p.value >= 66 ? 'var(--pos)' : p.value >= 33 ? 'var(--warn)' : 'var(--neg)' }} /></div><span className="num">{Math.round(p.value)}</span></div></td>
              <td className="r num">{Math.round(p.weight * 100)}%</td>
              <td className="r num"><b>{(p.value * p.weight).toFixed(1)}</b></td>
            </tr>
          ))}
          <tr><td colSpan={4}><b>Journal score</b></td><td className="r num"><b style={{ fontSize: 16 }}>{Math.round(s.score.total)}</b></td></tr>
        </tbody>
      </table>
    </div>
    {s.count < 20 && <p className="faint" style={{ marginTop: 12 }}>With only {s.count} trades the score moves a lot from one trade to the next. It settles as the journal grows.</p>}
  </>
  return (
    <Modal title={titles[kind]} onClose={onClose} wide={kind === 'score'} footer={<><button className="btn primary" onClick={() => { onClose(); nav.go('reports') }}>Open full reports</button><button className="btn" onClick={onClose}>Close</button></>}>
      {body}
    </Modal>
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
  const [detail, setDetail] = useState<Detail | null>(null)
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
        <Tile label="Net P&L" value={money(s.net)} tone={s.net} onClick={() => setDetail('net')}><div className="stat-sub">{s.count} trades · fees {money(s.fees, 0)}</div></Tile>
        <Tile label="Trade win %" value={pct(s.winRate)} right={<Gauge wins={s.wins} losses={s.losses} />} onClick={() => setDetail('win')} />
        <Tile label="Profit factor" value={num(s.profitFactor)} right={<Ring share={s.grossProfit / (s.grossProfit + s.grossLoss || 1)} />} onClick={() => setDetail('pf')} />
        <Tile label="Day win %" value={pct(s.dayWinRate)} right={<Gauge wins={s.winDays} losses={s.lossDays} />} onClick={() => setDetail('day')} />
        <Tile label="Avg win/loss trade" value={num(s.payoff)} onClick={() => setDetail('payoff')}>
          <div className="progress" style={{ marginTop: 10, background: 'var(--neg)' }}><div style={{ width: `${(s.avgWin / (s.avgWin + s.avgLoss || 1)) * 100}%`, background: 'var(--pos)', borderRadius: 0 }} /></div>
          <div className="row between num" style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}><span className="pos">{money(s.avgWin, 0)}</span><span className="neg">-{money(s.avgLoss, 0)}</span></div>
        </Tile>
      </div>

      <div className="grid g3">
        <Card className="tile" title="Journal score" right={<button className="btn ghost sm" onClick={() => setDetail('score')}>See breakdown</button>}>
          <div onClick={() => setDetail('score')}>
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
          </div>
        </Card>
        <Card title="Daily net cumulative P&L" right={<button className="btn ghost sm" onClick={() => nav.go('reports')}>Reports</button>}><EquityChart data={s.equity} start={start} height={270} /></Card>
        <Card title="Net daily P&L" right={<button className="btn ghost sm" onClick={() => nav.go('journal')}>Daily journal</button>}><PnlBars data={s.days.slice(-40).map((d) => ({ label: d.date, value: d.net, count: d.count }))} labelFmt={shortDate} height={270} /></Card>
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
      {detail && <DetailModal kind={detail} s={s} trades={trades} onClose={() => setDetail(null)} />}
    </>
  )
}
