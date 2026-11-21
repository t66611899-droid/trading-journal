import type { Trade } from './types'
import { dayKey } from './format'
import { getState } from './store'

export const net = (t: Trade) => t.pnl - (t.fees || 0)
export const holdMin = (t: Trade) => Math.max(0, (new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime()) / 60000)
export const rMultiple = (t: Trade): number | null => (t.risk && t.risk > 0 ? net(t) / t.risk : null)

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)
const avg = (a: number[]) => (a.length ? sum(a) / a.length : 0)

export type Outcome = 'win' | 'loss' | 'be'
export function outcome(t: Trade): Outcome {
  const be = getState().settings.breakeven || 0
  const n = net(t)
  return Math.abs(n) <= be ? 'be' : n > 0 ? 'win' : 'loss'
}

export interface DayStat { date: string; net: number; count: number; wins: number; losses: number; trades: Trade[] }
export interface EquityPoint { date: string; equity: number; pnl: number; dd: number }

export interface Stats {
  count: number; wins: number; losses: number; be: number
  net: number; gross: number; fees: number; grossProfit: number; grossLoss: number
  winRate: number; profitFactor: number; avgWin: number; avgLoss: number; payoff: number; expectancy: number
  largestWin: number; largestLoss: number
  avgHold: number; avgHoldWin: number; avgHoldLoss: number
  maxConsecWins: number; maxConsecLosses: number; currentStreak: number
  maxDrawdown: number; maxDrawdownPct: number; recoveryFactor: number
  avgR: number; rCount: number
  tradingDays: number; winDays: number; lossDays: number; dayWinRate: number
  avgDaily: number; avgWinDay: number; avgLossDay: number; bestDay: DayStat | null; worstDay: DayStat | null
  avgTradesPerDay: number; avgMonthly: number; avgYearly: number; sharpe: number; dailyStd: number
  days: DayStat[]; equity: EquityPoint[]
  score: { total: number; parts: { name: string; value: number }[] }
}

export function dailyStats(trades: Trade[]): DayStat[] {
  const m = new Map<string, DayStat>()
  for (const t of trades) {
    const k = dayKey(t.exitTime)
    let d = m.get(k)
    if (!d) m.set(k, (d = { date: k, net: 0, count: 0, wins: 0, losses: 0, trades: [] }))
    const n = net(t)
    d.net += n
    d.count++
    const o = outcome(t)
    if (o === 'win') d.wins++
    else if (o === 'loss') d.losses++
    d.trades.push(t)
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date))
}

const clamp = (x: number) => Math.max(0, Math.min(100, x))

export function computeStats(trades: Trade[], startBalance = 0): Stats {
  const sorted = [...trades].sort((a, b) => a.exitTime.localeCompare(b.exitTime))
  const nets = sorted.map(net)
  const outs = sorted.map(outcome)
  const winsArr = nets.filter((_, i) => outs[i] === 'win')
  const lossArr = nets.filter((_, i) => outs[i] === 'loss')
  const grossProfit = sum(winsArr)
  const grossLoss = Math.abs(sum(lossArr))
  const count = sorted.length
  const decided = winsArr.length + lossArr.length
  const winRate = decided ? (winsArr.length / decided) * 100 : 0
  const avgWin = avg(winsArr)
  const avgLoss = Math.abs(avg(lossArr))

  let cw = 0, cl = 0, mcw = 0, mcl = 0
  for (const o of outs) {
    if (o === 'win') { cw++; cl = 0 } else if (o === 'loss') { cl++; cw = 0 }
    mcw = Math.max(mcw, cw); mcl = Math.max(mcl, cl)
  }

  const days = dailyStats(sorted)
  let eq = startBalance, peak = startBalance, maxDD = 0, maxDDPct = 0
  const equity: EquityPoint[] = []
  for (const d of days) {
    eq += d.net
    peak = Math.max(peak, eq)
    const dd = peak - eq
    if (dd > maxDD) { maxDD = dd; maxDDPct = peak > 0 ? (dd / peak) * 100 : 0 }
    equity.push({ date: d.date, equity: eq, pnl: d.net, dd: -dd })
  }
  const dayNets = days.map((d) => d.net)
  const winDays = days.filter((d) => d.net > 0)
  const lossDays = days.filter((d) => d.net < 0)
  const avgDaily = avg(dayNets)
  const dailyStd = dayNets.length > 1 ? Math.sqrt(sum(dayNets.map((x) => (x - avgDaily) ** 2)) / (dayNets.length - 1)) : 0
  const months = new Set(days.map((d) => d.date.slice(0, 7))).size
  const totalNet = sum(nets)
  const rs = sorted.map(rMultiple).filter((x): x is number => x !== null)
  const profitFactor = grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0
  const payoff = avgLoss ? avgWin / avgLoss : avgWin ? Infinity : 0
  const recoveryFactor = maxDD ? totalNet / maxDD : totalNet > 0 ? Infinity : 0
  const dayWinRate = days.length ? (winDays.length / days.length) * 100 : 0
  // Consistency: how little the single best day dominates total profit.
  const bestDayNet = Math.max(0, ...dayNets)
  const consistency = totalNet > 0 && bestDayNet > 0 ? clamp((1 - bestDayNet / Math.max(totalNet, bestDayNet)) * 125) : 0

  const parts = [
    { name: 'Win %', value: clamp((winRate / 60) * 100) },
    { name: 'Profit factor', value: clamp(((Math.min(profitFactor, 2.6) - 1) / 1.6) * 100) },
    { name: 'Avg win/loss', value: clamp(((Math.min(payoff, 2.4) - 0.2) / 2.2) * 100) },
    { name: 'Recovery', value: clamp((Math.min(recoveryFactor, 3.5) / 3.5) * 100) },
    { name: 'Max drawdown', value: startBalance > 0 ? clamp(100 - maxDDPct * 10) : clamp(100 - (totalNet > 0 ? (maxDD / totalNet) * 100 : 100)) },
    { name: 'Consistency', value: consistency },
  ]
  const weights = [0.15, 0.25, 0.2, 0.1, 0.2, 0.1]
  const total = count ? sum(parts.map((p, i) => p.value * weights[i])) : 0

  return {
    count, wins: winsArr.length, losses: lossArr.length, be: count - decided,
    net: totalNet, gross: sum(sorted.map((t) => t.pnl)), fees: sum(sorted.map((t) => t.fees || 0)), grossProfit, grossLoss,
    winRate, profitFactor, avgWin, avgLoss, payoff, expectancy: count ? totalNet / count : 0,
    largestWin: Math.max(0, ...nets), largestLoss: Math.min(0, ...nets),
    avgHold: avg(sorted.map(holdMin)),
    avgHoldWin: avg(sorted.filter((_, i) => outs[i] === 'win').map(holdMin)),
    avgHoldLoss: avg(sorted.filter((_, i) => outs[i] === 'loss').map(holdMin)),
    maxConsecWins: mcw, maxConsecLosses: mcl, currentStreak: cw || -cl,
    maxDrawdown: maxDD, maxDrawdownPct: maxDDPct, recoveryFactor,
    avgR: avg(rs), rCount: rs.length,
    tradingDays: days.length, winDays: winDays.length, lossDays: lossDays.length, dayWinRate,
    avgDaily, avgWinDay: avg(winDays.map((d) => d.net)), avgLossDay: avg(lossDays.map((d) => d.net)),
    bestDay: days.length ? days.reduce((a, b) => (b.net > a.net ? b : a)) : null,
    worstDay: days.length ? days.reduce((a, b) => (b.net < a.net ? b : a)) : null,
    avgTradesPerDay: days.length ? count / days.length : 0,
    avgMonthly: months ? totalNet / months : 0,
    avgYearly: months ? (totalNet / months) * 12 : 0,
    sharpe: dailyStd ? (avgDaily / dailyStd) * Math.sqrt(252) : 0, dailyStd,
    days, equity, score: { total, parts },
  }
}

export interface Group {
  key: string; label: string; count: number; wins: number; losses: number
  winRate: number; net: number; avg: number; profitFactor: number; avgWin: number; avgLoss: number
}

export function groupBy(trades: Trade[], keyFn: (t: Trade) => string | string[] | null, labelFn: (k: string) => string = (k) => k): Group[] {
  const m = new Map<string, Trade[]>()
  for (const t of trades) {
    const k = keyFn(t)
    for (const key of Array.isArray(k) ? k : k === null ? [] : [k]) {
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(t)
    }
  }
  return [...m.entries()].map(([key, ts]) => {
    const w = ts.filter((t) => outcome(t) === 'win').map(net)
    const l = ts.filter((t) => outcome(t) === 'loss').map(net)
    const gl = Math.abs(sum(l))
    const total = sum(ts.map(net))
    return {
      key, label: labelFn(key), count: ts.length, wins: w.length, losses: l.length,
      winRate: w.length + l.length ? (w.length / (w.length + l.length)) * 100 : 0,
      net: total, avg: total / ts.length, profitFactor: gl ? sum(w) / gl : w.length ? Infinity : 0,
      avgWin: avg(w), avgLoss: avg(l),
    }
  })
}

export const DURATION_BUCKETS = ['Under 1 min', '1–5 min', '5–15 min', '15–30 min', '30–60 min', '1–4 hours', 'Over 4 hours']
export function durationBucket(t: Trade): string {
  const m = holdMin(t)
  return DURATION_BUCKETS[m < 1 ? 0 : m < 5 ? 1 : m < 15 ? 2 : m < 30 ? 3 : m < 60 ? 4 : m < 240 ? 5 : 6]
}

// ---- Monte Carlo forecast: bootstrap historical daily results ----
export interface Forecast {
  bands: { day: number; p5: number; p25: number; p50: number; p75: number; p95: number }[]
  probProfit: number; median: number; p5: number; p95: number; mean: number
  medianMaxDD: number; probDD: number; ddLimit: number
}

export function monteCarlo(dayNets: number[], days: number, start: number, ddLimit: number, runs = 2000, tradeFreq = 1): Forecast | null {
  if (dayNets.length < 5) return null
  let seed = 1234567
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
  const step = Math.max(1, Math.ceil(days / 60))
  const cols: number[][] = []
  for (let d = 0; d <= days; d += step) cols.push([])
  const finals: number[] = [], dds: number[] = []
  let ddHits = 0
  for (let r = 0; r < runs; r++) {
    let eq = start, peak = start, maxDD = 0
    cols[0].push(eq)
    for (let d = 1; d <= days; d++) {
      if (rand() < tradeFreq) eq += dayNets[Math.floor(rand() * dayNets.length)]
      peak = Math.max(peak, eq)
      maxDD = Math.max(maxDD, peak - eq)
      if (d % step === 0) cols[d / step].push(eq)
    }
    finals.push(eq); dds.push(maxDD)
    if (maxDD >= ddLimit) ddHits++
  }
  const q = (arr: number[], p: number) => {
    const s = [...arr].sort((a, b) => a - b)
    return s[Math.min(s.length - 1, Math.floor(p * s.length))]
  }
  return {
    bands: cols.map((c, i) => ({ day: i * step, p5: q(c, 0.05), p25: q(c, 0.25), p50: q(c, 0.5), p75: q(c, 0.75), p95: q(c, 0.95) })),
    probProfit: (finals.filter((f) => f > start).length / runs) * 100,
    median: q(finals, 0.5), p5: q(finals, 0.05), p95: q(finals, 0.95), mean: avg(finals),
    medianMaxDD: q(dds, 0.5), probDD: (ddHits / runs) * 100, ddLimit,
  }
}
