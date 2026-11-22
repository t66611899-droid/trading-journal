import React, { useEffect, useRef } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { compact, money, pct, shortDate } from '../lib/format'
import type { EquityPoint, Forecast, Group } from '../lib/stats'
import { useStore } from '../lib/store'

const axis = { tickLine: false, axisLine: false, tick: { fontSize: 11 }, tickMargin: 8 } as const
const grid = <CartesianGrid stroke="var(--line)" vertical={false} />

/** Round axis bounds and evenly spaced ticks (…, -500, 0, 500, 1000) instead of arbitrary values. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) { min -= 1; max += 1 }
  const rough = (max - min) / (count - 1)
  const mag = 10 ** Math.floor(Math.log10(rough))
  const n = rough / mag
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step
  const out: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(6))
  return out
}

function Tip({ active, payload, label, render }: any) {
  if (!active || !payload?.length) return null
  return <div className="tip">{render(payload[0].payload, label)}</div>
}

export function EquityChart({ data, height = 260, start }: { data: EquityPoint[]; height?: number; start: number }) {
  if (!data.length) return <div className="empty">No data to display</div>
  const full = [{ date: '', equity: start, pnl: 0, dd: 0 }, ...data]
  const up = data[data.length - 1].equity >= start
  const color = up ? 'var(--pos)' : 'var(--neg)'
  const rel = full.map((d) => d.equity - start)
  const ticks = niceTicks(Math.min(0, ...rel), Math.max(0, ...rel)).map((t) => t + start)
  const hi = Math.max(...rel), lo = Math.min(...rel)
  const zero = hi <= 0 ? 0 : lo >= 0 ? 1 : hi / (hi - lo) // where the starting line falls between the top and bottom of the curve
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={full} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <defs>
          {/* Green above the starting line, red below it. */}
          <linearGradient id="eqLine" x1="0" y1="0" x2="0" y2="1">
            <stop offset={zero} stopColor="var(--pos)" /><stop offset={zero} stopColor="var(--neg)" />
          </linearGradient>
          <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--pos)" stopOpacity={0.3} />
            <stop offset={zero} stopColor="var(--pos)" stopOpacity={0.04} />
            <stop offset={zero} stopColor="var(--neg)" stopOpacity={0.04} />
            <stop offset="1" stopColor="var(--neg)" stopOpacity={0.3} />
          </linearGradient>
        </defs>
        {grid}
        <XAxis dataKey="date" {...axis} tickFormatter={(d) => (d ? shortDate(d) : '')} minTickGap={40} />
        <YAxis {...axis} tickFormatter={(v) => compact(v - start)} width={56} ticks={ticks} domain={[ticks[0], ticks[ticks.length - 1]]} />
        <ReferenceLine y={start} stroke="var(--line2)" />
        <Tooltip cursor={{ stroke: 'var(--line2)', strokeDasharray: '4 4' }} content={<Tip render={(p: EquityPoint) => (p.date ? <>
          <div className="muted">{shortDate(p.date)}</div>
          <div>Cumulative P&L: <b className={`num ${p.equity >= start ? 'pos' : 'neg'}`}>{money(p.equity - start)}</b></div>
          <div>That day: <b className={`num ${p.pnl >= 0 ? 'pos' : 'neg'}`}>{money(p.pnl)}</b></div>
        </> : <div className="muted">Start</div>)} />} />
        <Area animationDuration={450} type="linear" dataKey="equity" stroke="url(#eqLine)" strokeWidth={2.5} fill="url(#eq)" baseValue={start}
          dot={full.length <= 31 ? { r: 3, fill: 'var(--panel)', stroke: color, strokeWidth: 2 } : false} activeDot={{ r: 5, fill: color, stroke: 'var(--panel)', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function DrawdownChart({ data, height = 160 }: { data: EquityPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey="date" {...axis} tickFormatter={shortDate} minTickGap={40} />
        <YAxis {...axis} tickFormatter={compact} width={58} />
        <Tooltip content={<Tip render={(p: EquityPoint) => <><div className="muted">{shortDate(p.date)}</div><div>Drawdown: <b className="num neg">{money(p.dd)}</b></div></>} />} />
        <Area type="monotone" dataKey="dd" stroke="var(--neg)" strokeWidth={1.5} fill="var(--neg-soft)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function PnlBars({ data, height = 220, labelFmt = (s: string) => s, money: isMoney = true }: { data: { label: string; value: number; count?: number; winRate?: number }[]; height?: number; labelFmt?: (s: string) => string; money?: boolean }) {
  if (!data.length) return <div className="empty">No data to display</div>
  const vals = data.map((d) => d.value)
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey="label" {...axis} tickFormatter={labelFmt} minTickGap={8} interval="preserveStartEnd" />
        <YAxis {...axis} tickFormatter={isMoney ? compact : (v) => String(Math.abs(v))} width={56} ticks={ticks} domain={[ticks[0], ticks[ticks.length - 1]]} />
        <ReferenceLine y={0} stroke="var(--line2)" />
        <Tooltip cursor={{ fill: 'var(--panel2)' }} content={<Tip render={(p: any) => <>
          <div className="muted">{labelFmt(p.label)}</div>
          {isMoney && <div>Net P&L: <b className={`num ${p.value >= 0 ? 'pos' : 'neg'}`}>{money(p.value)}</b></div>}
          {p.count !== undefined && <div>Trades: <b>{p.count}</b></div>}
          {p.winRate !== undefined && <div>Win rate: <b className="num">{pct(p.winRate)}</b></div>}
        </>} />} />
        <Bar animationDuration={450} dataKey="value" radius={[5, 5, 5, 5]} maxBarSize={34}>
          {data.map((d, i) => <Cell key={i} fill={d.value >= 0 ? 'var(--pos)' : 'var(--neg)'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export const groupBars = (groups: Group[]) => groups.map((g) => ({ label: g.label, value: g.net, count: g.count, winRate: g.winRate }))

const scoreColor = (v: number) => (v >= 66 ? 'var(--pos)' : v >= 33 ? 'var(--warn)' : 'var(--neg)')

/** Small card shown when hovering a point of the score radar. */
function ScoreTip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="tip" style={{ width: 230 }}>
      <div className="row between"><b>{p.name}</b><b className="num" style={{ color: scoreColor(p.value) }}>{Math.round(p.value)}<span className="faint" style={{ fontWeight: 500 }}> / 100</span></b></div>
      <div className="progress" style={{ margin: '8px 0', height: 5 }}><div style={{ width: `${p.value}%`, background: scoreColor(p.value) }} /></div>
      {p.raw && <div className="row between" style={{ fontSize: 12 }}><span className="muted">Your value</span><span className="num">{p.raw}</span></div>}
      {p.how && <div className="muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.45 }}>{p.how}</div>}
    </div>
  )
}

export function ScoreRadar({ parts, height = 230 }: { parts: { name: string; value: number; raw?: string; how?: string }[]; height?: number }) {
  // Each corner shows the part's name with its score underneath.
  const tick = ({ x, y, textAnchor, payload, index }: any) => (
    <text x={x} y={y} textAnchor={textAnchor} fontSize={11.5}>
      <tspan x={x} dy={y < height / 2 ? -8 : 4} fill="var(--muted)">{payload.value}</tspan>
      <tspan x={x} dy={14} fill="var(--text)" fontWeight={700}>{Math.round(parts[index]?.value ?? 0)}</tspan>
    </text>
  )
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={parts} outerRadius="76%" margin={{ top: 16, right: 8, bottom: 12, left: 8 }}>
        <defs>
          <linearGradient id="scoreFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b7bff" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#4f8cff" stopOpacity={0.3} />
          </linearGradient>
        </defs>
        <PolarGrid stroke="var(--line)" />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} tickCount={5} />
        <PolarAngleAxis dataKey="name" tick={tick} />
        <Tooltip content={<ScoreTip />} cursor={false} />
        <Radar animationDuration={450} dataKey="value" stroke="var(--accent)" fill="url(#scoreFill)" strokeWidth={2} strokeLinejoin="round"
          dot={{ r: 3.5, fill: 'var(--panel)', stroke: 'var(--accent)', strokeWidth: 2, fillOpacity: 1 }}
          activeDot={{ r: 6, fill: 'var(--accent)', stroke: 'var(--panel)', strokeWidth: 2 }} />
      </RadarChart>
    </ResponsiveContainer>
  )
}

export function ForecastChart({ f, start, height = 340 }: { f: Forecast; start: number; height?: number }) {
  const data = f.bands.map((b) => ({ ...b, outer: [b.p5, b.p95], inner: [b.p25, b.p75] }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey="day" {...axis} tickFormatter={(d) => `Day ${d}`} minTickGap={50} />
        <YAxis {...axis} tickFormatter={compact} width={62} domain={['auto', 'auto']} />
        <ReferenceLine y={start} stroke="var(--line2)" strokeDasharray="4 4" />
        <Tooltip content={<Tip render={(p: any) => <>
          <div className="muted">Trading day {p.day}</div>
          <div>Optimistic (95%): <b className="num">{money(p.p95, 0)}</b></div>
          <div>Median: <b className="num">{money(p.p50, 0)}</b></div>
          <div>Pessimistic (5%): <b className="num">{money(p.p5, 0)}</b></div>
        </>} />} />
        <Area dataKey="outer" stroke="none" fill="var(--accent)" fillOpacity={0.12} />
        <Area dataKey="inner" stroke="none" fill="var(--accent)" fillOpacity={0.22} />
        <Line dataKey="p50" stroke="var(--accent)" strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function Sparkline({ values, width = 150, height = 44 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null
  const min = Math.min(0, ...values), max = Math.max(0, ...values)
  const span = max - min || 1
  const x = (i: number) => (i / (values.length - 1)) * width
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6)
  const last = values[values.length - 1]
  return (
    <svg width={width} height={height} ><line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="var(--line2)" strokeDasharray="3 3" />
      <polyline fill="none" stroke={last >= 0 ? 'var(--pos)' : 'var(--neg)'} strokeWidth={2} points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
    </svg>
  )
}

// ---- TradingView embeds ----
function TvWidget({ script, config, height }: { script: string; config: object; height: number | string }) {
  const ref = useRef<HTMLDivElement>(null)
  const json = JSON.stringify(config)
  useEffect(() => {
    const el = ref.current!
    el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>'
    const s = document.createElement('script')
    s.src = `https://s3.tradingview.com/external-embedding/${script}.js`
    s.async = true
    s.innerHTML = json
    el.appendChild(s)
    return () => { el.innerHTML = '' }
  }, [script, json])
  // The TradingView script rewrites its container's size to 100%, so the fixed height lives on a wrapper.
  return <div style={{ height, width: '100%' }}><div className="tradingview-widget-container" ref={ref} style={{ height: '100%', width: '100%' }} /></div>
}

export function TvChart({ symbol, interval = '5', height = 420 }: { symbol: string; interval?: string; height?: number | string }) {
  const theme = useStore((s) => s.settings.theme)
  return <TvWidget script="embed-widget-advanced-chart" height={height} config={{
    autosize: true, symbol, interval, timezone: 'Asia/Jerusalem', theme, style: '1', locale: 'en',
    allow_symbol_change: true, hide_side_toolbar: false, calendar: false, support_host: 'https://www.tradingview.com',
  }} />
}

export function TvEconomicCalendar({ height = 520 }: { height?: number }) {
  const theme = useStore((s) => s.settings.theme)
  return <TvWidget script="embed-widget-events" height={height} config={{
    colorTheme: theme, isTransparent: true, width: '100%', height: '100%', locale: 'en', importanceFilter: '0,1', countryFilter: 'us,eu,gb,jp,il',
  }} />
}

export function TvTickerTape() {
  const theme = useStore((s) => s.settings.theme)
  return <TvWidget script="embed-widget-ticker-tape" height={60} config={{
    symbols: [
      { proName: 'FOREXCOM:SPXUSD', title: 'S&P 500' }, { proName: 'FOREXCOM:NSXUSD', title: 'Nasdaq 100' },
      { proName: 'OANDA:XAUUSD', title: 'Gold' }, { proName: 'FX:EURUSD', title: 'EUR/USD' },
      { proName: 'FX_IDC:USDILS', title: 'USD/ILS' }, { proName: 'BITSTAMP:BTCUSD', title: 'Bitcoin' },
    ],
    showSymbolLogo: true, isTransparent: true, displayMode: 'adaptive', colorTheme: theme, locale: 'en',
  }} />
}
