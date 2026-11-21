import type { Trade } from './types'
import { rootSymbol } from './instruments'
import { getState, setState } from './store'

// Commission rates are per contract, per side (one buy or one sell), keyed by root symbol; '*' is the fallback.
export type FeeRates = Record<string, number>

/** Contracts that changed hands in the trade: every fill is charged, so a 10-lot round trip is 20. */
export const contractsTraded = (t: Trade) => (t.executions?.length ? t.executions.reduce((s, e) => s + e.qty, 0) : t.qty * 2)

export const rateFor = (symbol: string, rates: FeeRates) => rates[rootSymbol(symbol)] ?? rates['*'] ?? 0

/** Fill in fees for trades that came without any (or were auto-filled before); broker-reported fees are never touched. */
export function withFeeRates(trades: Trade[], rates: FeeRates): Trade[] {
  return trades.map((t) => {
    if (t.fees && !t.feesAuto) return t
    const fees = Math.round(rateFor(t.symbol, rates) * contractsTraded(t) * 100) / 100
    if (!fees && !t.feesAuto) return t
    return { ...t, fees, feesAuto: fees > 0 }
  })
}

export function setFeeRate(key: string, rate: number | undefined) {
  setState((s) => {
    const rates = { ...(s.settings.feeRates || {}) }
    if (rate === undefined || isNaN(rate)) delete rates[key]
    else rates[key] = rate
    return { settings: { ...s.settings, feeRates: rates }, trades: withFeeRates(s.trades, rates) }
  })
}
export const currentRates = (): FeeRates => getState().settings.feeRates || {}
