import type { Playbook, Trade } from './types'

// Deterministic demo data so first launch shows a populated journal.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

export function makeDemo(): { trades: Trade[]; playbooks: Playbook[] } {
  const r = rng(42)
  const playbooks: Playbook[] = [
    { id: 'demo-orb', name: 'Opening Range Breakout', description: 'Break of the first 15-minute range with volume', color: '#7c5cff',
      rules: ['Opening range is clearly defined', 'Breakout on above-average volume', 'Stop below the range midpoint', 'No red-folder news in the next 30 minutes'] },
    { id: 'demo-pullback', name: 'Trend Pullback', description: 'Entry on a pullback to VWAP / EMA21 in the trend direction', color: '#2ebd85',
      rules: ['Clear trend on the 15-minute chart', 'Pullback to VWAP or EMA21', 'Reversal candle for confirmation', 'Reward/risk of at least 2:1'] },
    { id: 'demo-reversal', name: 'Key Level Reversal', description: 'Rejection from a daily support/resistance level', color: '#f0a020',
      rules: ['Daily level marked in advance', 'Clear rejection / delta divergence', 'Enter only after confirmation'] },
  ]
  const syms = [
    { s: 'NQ', mult: 20, base: 21500, vol: 60, w: 0.45 },
    { s: 'ES', mult: 50, base: 5950, vol: 14, w: 0.25 },
    { s: 'GC', mult: 100, base: 2680, vol: 8, w: 0.18 },
    { s: 'MNQ', mult: 2, base: 21500, vol: 60, w: 0.12 },
  ]
  const hourBias: Record<number, number> = { 15: -0.04, 16: 0.12, 17: 0.1, 18: 0.03, 19: -0.02, 20: -0.05, 21: -0.12, 22: -0.15 }
  const dayBias = [0, -0.03, 0.08, 0.07, 0, -0.12, 0]
  const mistakes = ['FOMO', 'Moved stop', 'Early entry', 'Revenge trade', 'Oversized']
  const tags = ['News', 'Strong trend', 'Choppy', 'Open', 'A+']
  const emotions = ['Calm', 'Confident', 'Hesitant', 'Stressed', 'Impatient']
  const trades: Trade[] = []
  const today = new Date()
  for (let back = 170; back >= 1; back--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back)
    const wd = d.getDay()
    if (wd === 0 || wd === 6) continue
    if (r() < 0.12) continue
    const n = 1 + Math.floor(r() * 3.6)
    let lossesToday = 0
    for (let i = 0; i < n; i++) {
      const hour = 15 + Math.floor(r() * 8)
      const sym = (() => {
        let x = r()
        for (const s of syms) { if (x < s.w) return s; x -= s.w }
        return syms[0]
      })()
      const setup = playbooks[Math.floor(r() * 3)]
      const tilt = lossesToday >= 2
      const p = 0.5 + (hourBias[hour] ?? 0) + dayBias[wd] + (setup.id === 'demo-pullback' ? 0.06 : setup.id === 'demo-reversal' ? -0.05 : 0) - (tilt ? 0.15 : 0)
      const win = r() < p
      const qty = sym.s === 'MNQ' ? 2 + Math.floor(r() * 6) : 1 + Math.floor(r() * (tilt ? 3 : 2))
      const risk = sym.s === 'MNQ' ? 100 : 250
      const rMult = win ? 0.4 + r() * 2.4 : -(0.35 + r() * (tilt ? 1.2 : 0.75))
      const pnl = Math.round(risk * rMult * 100) / 100
      const side = r() < 0.56 ? 'long' : 'short'
      const dir = side === 'long' ? 1 : -1
      const tick = sym.s === 'GC' ? 0.1 : 0.25
      const entryPrice = Math.round((sym.base + (r() - 0.5) * sym.vol * 20 + (170 - back) * sym.vol * 0.05) / tick) * tick
      const move = pnl / (qty * sym.mult)
      const exitPrice = Math.round((entryPrice + dir * move) / tick) * tick
      const realPnl = Math.round((exitPrice - entryPrice) * dir * qty * sym.mult * 100) / 100
      const riskPts = risk / (qty * sym.mult)
      const entry = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, Math.floor(r() * 60), Math.floor(r() * 60))
      const holdMin = win ? 4 + r() * 55 : 2 + r() * 25
      const exit = new Date(entry.getTime() + holdMin * 60000)
      if (!win) lossesToday++
      const mis = !win && r() < 0.45 ? [mistakes[Math.floor(r() * mistakes.length)]] : tilt ? ['Revenge trade'] : []
      trades.push({
        id: `demo-${back}-${i}`, accountId: 'main', symbol: sym.s, side, multiplier: sym.mult, qty,
        entryTime: entry.toISOString(), exitTime: exit.toISOString(), entryPrice, exitPrice,
        pnl: realPnl, fees: Math.round(qty * (sym.s === 'MNQ' ? 1.04 : 4.36) * 100) / 100,
        stopLoss: Math.round((entryPrice - dir * riskPts) / tick) * tick,
        takeProfit: Math.round((entryPrice + dir * riskPts * 2) / tick) * tick,
        risk,
        mae: Math.round(risk * (win ? r() * 0.7 : Math.abs(rMult) + r() * 0.1) * 100) / 100,
        mfe: Math.round(risk * (win ? rMult + r() * 0.8 : r() * 0.9) * 100) / 100,
        setupId: setup.id, rulesFollowed: setup.rules.filter(() => r() < (mis.length ? 0.5 : 0.9)),
        tags: r() < 0.5 ? [tags[Math.floor(r() * tags.length)]] : [], mistakes: mis,
        rating: win ? 3 + Math.floor(r() * 3) : 1 + Math.floor(r() * 3),
        emotion: tilt ? 'Stressed' : emotions[Math.floor(r() * emotions.length)],
        notes: '', images: [], demo: true, source: 'demo',
        executions: [
          { time: entry.toISOString(), side: side === 'long' ? 'buy' : 'sell', qty, price: entryPrice },
          { time: exit.toISOString(), side: side === 'long' ? 'sell' : 'buy', qty, price: exitPrice },
        ],
      })
    }
  }
  return { trades, playbooks }
}
