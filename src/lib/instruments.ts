// Futures point values and TradingView symbol guesses.
const FUT: Record<string, { mult: number; tv: string }> = {
  ES: { mult: 50, tv: 'CME_MINI:ES1!' }, MES: { mult: 5, tv: 'CME_MINI:MES1!' },
  NQ: { mult: 20, tv: 'CME_MINI:NQ1!' }, MNQ: { mult: 2, tv: 'CME_MINI:MNQ1!' },
  YM: { mult: 5, tv: 'CBOT_MINI:YM1!' }, MYM: { mult: 0.5, tv: 'CBOT_MINI:MYM1!' },
  RTY: { mult: 50, tv: 'CME_MINI:RTY1!' }, M2K: { mult: 5, tv: 'CME_MINI:M2K1!' },
  CL: { mult: 1000, tv: 'NYMEX:CL1!' }, MCL: { mult: 100, tv: 'NYMEX:MCL1!' },
  NG: { mult: 10000, tv: 'NYMEX:NG1!' },
  GC: { mult: 100, tv: 'COMEX:GC1!' }, MGC: { mult: 10, tv: 'COMEX:MGC1!' },
  SI: { mult: 5000, tv: 'COMEX:SI1!' }, SIL: { mult: 1000, tv: 'COMEX:SIL1!' },
  HG: { mult: 25000, tv: 'COMEX:HG1!' },
  ZB: { mult: 1000, tv: 'CBOT:ZB1!' }, ZN: { mult: 1000, tv: 'CBOT:ZN1!' },
  '6E': { mult: 125000, tv: 'CME:6E1!' }, '6B': { mult: 62500, tv: 'CME:6B1!' },
  '6J': { mult: 12500000, tv: 'CME:6J1!' }, '6A': { mult: 100000, tv: 'CME:6A1!' },
  BTC: { mult: 5, tv: 'CME:BTC1!' }, MBT: { mult: 0.1, tv: 'CME:MBT1!' },
}

/** "NQZ6" / "MNQH2026" / "ESZ25" -> "NQ" / "MNQ" / "ES". Non-futures are returned unchanged. */
export function rootSymbol(symbol: string): string {
  const s = (symbol || '').toUpperCase().trim().replace(/^\//, '')
  const m = s.match(/^([A-Z0-9]{1,4}?)[FGHJKMNQUVXZ]\d{1,4}$/)
  if (m && FUT[m[1]]) return m[1]
  return s
}

export function guessMultiplier(symbol: string): number {
  return FUT[rootSymbol(symbol)]?.mult ?? 1
}

// The free TradingView embed cannot show CME/NYMEX/COMEX futures, so the in-app chart uses the matching spot/CFD market.
const EMBED: Record<string, string> = {
  ES: 'OANDA:SPX500USD', MES: 'OANDA:SPX500USD', NQ: 'OANDA:NAS100USD', MNQ: 'OANDA:NAS100USD',
  YM: 'OANDA:US30USD', MYM: 'OANDA:US30USD', RTY: 'OANDA:US2000USD', M2K: 'OANDA:US2000USD',
  CL: 'TVC:USOIL', MCL: 'TVC:USOIL', NG: 'OANDA:NATGASUSD', GC: 'OANDA:XAUUSD', MGC: 'OANDA:XAUUSD',
  SI: 'OANDA:XAGUSD', SIL: 'OANDA:XAGUSD', HG: 'OANDA:XCUUSD', ZB: 'TVC:US30Y', ZN: 'TVC:US10Y',
  '6E': 'FX:EURUSD', '6B': 'FX:GBPUSD', '6J': 'FX:USDJPY', '6A': 'FX:AUDUSD', BTC: 'BITSTAMP:BTCUSD', MBT: 'BITSTAMP:BTCUSD',
}
export const isFuture = (symbol: string) => !!FUT[rootSymbol(symbol)]
/** Symbol for the embedded chart widget. */
export const tvEmbedSymbol = (symbol: string) => EMBED[rootSymbol(symbol)] ?? tvSymbol(symbol)

export function tvSymbol(symbol: string): string {
  const root = rootSymbol(symbol)
  if (FUT[root]) return FUT[root].tv
  const s = symbol.toUpperCase().replace(/[^A-Z0-9:!.]/g, '')
  if (s.includes(':')) return s
  if (/^(XAUUSD|XAGUSD)$/.test(s)) return `OANDA:${s}`
  if (/^[A-Z]{6}$/.test(s) && /(USD|EUR|GBP|JPY|CHF|AUD|CAD|NZD)/.test(s)) return `FX:${s}`
  if (/(USDT|USDC)$/.test(s)) return `BINANCE:${s}`
  return s
}

/** TradingView snapshot link (tradingview.com/x/AbCd1234/) -> direct image URL. */
export function tvSnapshotImage(link?: string): string | null {
  if (!link) return null
  const m = link.match(/tradingview\.com\/x\/([A-Za-z0-9]+)/)
  if (!m) return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(link) ? link : null
  return `https://s3.tradingview.com/snapshots/${m[1][0].toLowerCase()}/${m[1]}.png`
}
