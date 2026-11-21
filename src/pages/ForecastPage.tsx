import React, { useMemo, useState } from 'react'
import { Card, Field, Seg, Stat } from '../components/ui'
import { ForecastChart } from '../components/charts'
import { useFilteredTrades, useStartBalance } from '../lib/store'
import { computeStats, monteCarlo } from '../lib/stats'
import { money, num, pct } from '../lib/format'

export default function ForecastPage() {
  const trades = useFilteredTrades()
  const start = useStartBalance()
  const s = useMemo(() => computeStats(trades, start), [trades, start])
  const current = start + s.net
  const [days, setDays] = useState<'21' | '63' | '126' | '252'>('63')
  const [ddPct, setDdPct] = useState(10)
  const [goal, setGoal] = useState(() => Math.round((current * 1.2) / 1000) * 1000 || 10000)
  const dayNets = s.days.map((d) => d.net)
  const ddLimit = (Math.max(current, 1) * ddPct) / 100
  const f = useMemo(() => monteCarlo(dayNets, +days, current, ddLimit), [trades, days, current, ddLimit])
  const need = goal - current
  const daysToGoal = s.avgDaily > 0 && need > 0 ? Math.ceil(need / s.avgDaily) : null

  if (!f)
    return <Card><div className="empty"><h2 style={{ color: 'var(--text)' }}>At least 5 trading days are needed for a forecast</h2><p>The forecast is built from your actual daily results in the selected range.</p></div></Card>

  const kv = (label: string, value: React.ReactNode, tone = '') => <div className="kv"><span>{label}</span><span className={`num ${tone}`}>{value}</span></div>
  return (
    <>
      <div className="page-head">
        <div className="muted">Monte Carlo simulation · 2,000 scenarios sampled from your {dayNets.length} actual trading days</div>
        <Seg value={days} onChange={setDays} options={[['21', '1 month'], ['63', '3 months'], ['126', '6 months'], ['252', '1 year']]} />
      </div>
      <div className="grid g4">
        <Stat label="Current balance" value={money(current, 0)} />
        <Stat label="Median outcome" value={money(f.median, 0)} tone={f.median - current} sub={`${f.median >= current ? '+' : ''}${money(f.median - current, 0)} vs today`} />
        <Stat label="Likely range (5%–95%)" value={`${money(f.p5, 0)} – ${money(f.p95, 0)}`} />
        <Stat label="Chance of ending in profit" value={pct(f.probProfit, 0)} />
      </div>
      <Card title={`Projected balance over ${days} trading days`} right={<span className="muted">Dark band: 50% of scenarios · light band: 90%</span>}>
        <ForecastChart f={f} start={current} />
      </Card>
      <div className="grid g3">
        <Card title="Run rate">
          {kv('Average daily P&L', money(s.avgDaily))}
          {kv('Per week (5 days)', money(s.avgDaily * 5, 0))}
          {kv('Per month (21 days)', money(s.avgDaily * 21, 0))}
          {kv('Per year (252 days)', money(s.avgDaily * 252, 0))}
        </Card>
        <Card title="Drawdown risk">
          <Field label="Drawdown threshold (% of balance)">
            <input type="number" className="input" value={ddPct} min={1} onChange={(e) => setDdPct(Math.max(1, +e.target.value || 1))} />
          </Field>
          <div style={{ marginTop: 6 }}>
            {kv(`Chance of a ${money(ddLimit, 0)}+ drawdown`, pct(f.probDD, 0), f.probDD > 30 ? 'neg' : '')}
            {kv('Median max drawdown', money(-f.medianMaxDD, 0), 'neg')}
          </div>
        </Card>
        <Card title="Balance goal">
          <Field label="Target balance"><input type="number" className="input" value={goal} onChange={(e) => setGoal(+e.target.value || 0)} /></Field>
          <div style={{ marginTop: 6 }}>
            {kv('Remaining', money(Math.max(0, need), 0))}
            {kv('Trading days at current pace', need <= 0 ? 'Reached' : daysToGoal ? `${daysToGoal} (~${num(daysToGoal / 21, 1)} months)` : '—')}
          </div>
        </Card>
      </div>
      <div className="faint" style={{ fontSize: 12.5 }}>
        The forecast assumes the future statistically resembles your past results and that trading days are independent. It illustrates the possible spread of outcomes — it is not a promise or investment advice.
      </div>
    </>
  )
}
