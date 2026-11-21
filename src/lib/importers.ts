import Papa from 'papaparse'
import type { Execution, Trade } from './types'
import { guessMultiplier } from './instruments'
import { uid } from './format'

export type Field =
  | 'symbol' | 'side' | 'qty' | 'entryPrice' | 'exitPrice' | 'entryTime' | 'exitTime' | 'pnl' | 'fees' | 'swap'
  | 'stopLoss' | 'takeProfit' | 'mae' | 'mfe' | 'notes' | 'price' | 'time'
  | 'buyPrice' | 'sellPrice' | 'buyTime' | 'sellTime'

export const FIELD_LABELS: Record<Field, string> = {
  symbol: 'Symbol', side: 'Side (Long/Short or Buy/Sell)', qty: 'Quantity', entryPrice: 'Entry price', exitPrice: 'Exit price',
  entryTime: 'Entry time', exitTime: 'Exit time', pnl: 'P&L', fees: 'Fees', swap: 'Swap', stopLoss: 'Stop loss',
  takeProfit: 'Take profit', mae: 'MAE', mfe: 'MFE', notes: 'Notes', price: 'Fill price', time: 'Fill time',
  buyPrice: 'Buy price', sellPrice: 'Sell price', buyTime: 'Buy time', sellTime: 'Sell time',
}

// Header aliases (normalized: lowercase, letters+digits only). Order = priority.
const ALIASES: Record<Field, string[]> = {
  symbol: ['symbol', 'instrument', 'contract', 'ticker', 'market', 'product', 'item', 'pair', 'asset'],
  side: ['side', 'direction', 'type', 'marketpos', 'marketposition', 'bs', 'action', 'buysell', 'position', 'longshort'],
  qty: ['qty', 'quantity', 'volume', 'size', 'amount', 'lots', 'filledqty', 'contracts', 'shares', 'units', 'filled'],
  entryPrice: ['entryprice', 'openprice', 'avgentryprice', 'priceopen', 'entry', 'open', 'avgentry', 'averageentryprice'],
  exitPrice: ['exitprice', 'closeprice', 'avgexitprice', 'priceclose', 'exit', 'close', 'avgexit', 'averageexitprice'],
  entryTime: ['entrytime', 'opentime', 'opendate', 'entrydate', 'timeopen', 'opened', 'openedat', 'dateopen', 'opendatetime', 'entrydatetime', 'openat', 'createdat'],
  exitTime: ['exittime', 'closetime', 'closedate', 'exitdate', 'timeclose', 'closed', 'closedat', 'dateclose', 'closedatetime', 'exitdatetime', 'closeat'],
  pnl: ['pnl', 'profit', 'netpl', 'netpnl', 'pl', 'realizedpnl', 'realizedpl', 'profitloss', 'netprofit', 'grosspnl', 'grosspl', 'result', 'gain', 'closedpnl'],
  fees: ['commission', 'fees', 'fee', 'commissions', 'comm', 'totalfees', 'commissionfees'],
  swap: ['swap', 'swaps', 'rollover', 'overnight', 'financing'],
  stopLoss: ['stoploss', 'sl', 'stop', 'stopprice'],
  takeProfit: ['takeprofit', 'tp', 'target', 'limitprice'],
  mae: ['mae'], mfe: ['mfe'],
  notes: ['notes', 'note', 'comment', 'comments', 'description'],
  price: ['avgfillprice', 'fillprice', 'avgprice', 'executionprice', 'execprice', 'price', 'tradeprice'],
  time: ['filltime', 'executiontime', 'exectime', 'timestamp', 'datetime', 'tradedate', 'date', 'time', 'tradetime'],
  buyPrice: ['buyprice', 'boughtprice'], sellPrice: ['sellprice', 'soldprice'],
  buyTime: ['boughttimestamp', 'buytime', 'boughttime'], sellTime: ['soldtimestamp', 'selltime', 'soldtime'],
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '')

export interface Parsed {
  headers: string[]
  rows: string[][]
  mapping: Partial<Record<Field, number>>
  mode: 'trades' | 'executions' | 'buysell'
  format: string
}

/** Extract the biggest table from an HTML report (MetaTrader exports HTML statements). */
function htmlToRows(html: string): string[][] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const rows: string[][] = []
  doc.querySelectorAll('tr').forEach((tr) => {
    const cells = [...tr.querySelectorAll('td,th')].filter((c) => !(c as HTMLElement).hidden && !/hidden/.test(c.getAttribute('class') || ''))
    rows.push(cells.map((c) => (c.textContent || '').trim()))
  })
  return rows
}

function textToRows(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const res = Papa.parse<string[]>(clean, { skipEmptyLines: 'greedy' })
  return (res.data as string[][]).map((r) => r.map((c) => String(c ?? '').trim()))
}

/** Find the header row: the first row (in the top 60) that matches the most known aliases. */
function findHeader(rows: string[][]): number {
  const all = new Set(Object.values(ALIASES).flat())
  let best = 0, bestScore = -1
  rows.slice(0, 60).forEach((r, i) => {
    const score = r.filter((c) => all.has(norm(c))).length
    if (score > bestScore) { bestScore = score; best = i }
  })
  return best
}

export function parseFile(name: string, text: string): Parsed {
  const isHtml = /\.html?$/i.test(name) || /^\s*<(!doctype|html)/i.test(text)
  let all = isHtml ? htmlToRows(text) : textToRows(text)
  all = all.filter((r) => r.some((c) => c !== ''))
  if (!all.length) throw new Error('The file is empty')
  const hi = findHeader(all)
  const headers = all[hi]
  // Stop at the next section header/blank (MT5 reports contain several tables).
  let rows = all.slice(hi + 1)
  const end = rows.findIndex((r) => r.filter((c) => c !== '').length <= 1 && rows.indexOf(r) > 0)
  if (end > 0) rows = rows.slice(0, end)
  rows = rows.filter((r) => r.length >= Math.min(headers.length, 4))

  const n = headers.map(norm)
  const mapping: Partial<Record<Field, number>> = {}
  const used = new Set<number>()
  const pick = (f: Field, from = 0) => {
    for (const a of ALIASES[f]) {
      const i = n.findIndex((h, idx) => idx >= from && h === a && !used.has(idx))
      if (i >= 0) { mapping[f] = i; used.add(i); return true }
    }
    return false
  }
  let format = 'Generic CSV'
  // MetaTrader positions: "Time, Position, Symbol, Type, Volume, Price, S/L, T/P, Time, Price, Commission, Swap, Profit"
  const timeIdx = n.map((h, i) => (h === 'time' ? i : -1)).filter((i) => i >= 0)
  const priceIdx = n.map((h, i) => (h === 'price' ? i : -1)).filter((i) => i >= 0)
  if (timeIdx.length >= 2 && priceIdx.length >= 2) {
    format = 'MetaTrader'
    mapping.entryTime = timeIdx[0]; mapping.exitTime = timeIdx[1]
    mapping.entryPrice = priceIdx[0]; mapping.exitPrice = priceIdx[1]
    ;[...timeIdx.slice(0, 2), ...priceIdx.slice(0, 2)].forEach((i) => used.add(i))
  }
  ;(['buyPrice', 'sellPrice', 'buyTime', 'sellTime'] as Field[]).forEach((f) => pick(f))
  const buysell = mapping.buyPrice !== undefined && mapping.sellPrice !== undefined && mapping.buyTime !== undefined && mapping.sellTime !== undefined
  if (buysell) format = 'Tradovate Performance'
  ;(['symbol', 'entryPrice', 'exitPrice', 'entryTime', 'exitTime', 'pnl', 'fees', 'swap', 'stopLoss', 'takeProfit', 'mae', 'mfe', 'qty', 'side', 'notes'] as Field[]).forEach(
    (f) => mapping[f] === undefined && pick(f),
  )
  const isTrades = buysell || (mapping.exitPrice !== undefined && mapping.entryPrice !== undefined) || (mapping.pnl !== undefined && mapping.exitTime !== undefined)
  if (!isTrades) { pick('price'); pick('time') }
  if (format === 'Generic CSV') {
    if (n.includes('marketpos')) format = 'NinjaTrader'
    else if (!isTrades && (n.includes('filledqty') || n.includes('avgfillprice') || n.includes('bs'))) format = 'Tradovate Orders'
    else if (!isTrades) format = 'Executions (fills)'
  }
  return { headers, rows, mapping, mode: buysell ? 'buysell' : isTrades ? 'trades' : 'executions', format }
}

export function parseNumber(s: string | undefined): number {
  if (s === undefined || s === null) return NaN
  let t = String(s).trim()
  if (!t) return NaN
  const neg = /^\(.*\)$/.test(t.replace(/[^\d().,-]/g, '')) || /^-/.test(t.replace(/[^\d.,-]/g, ''))
  t = t.replace(/[^\d.,]/g, '')
  // European format (1.234,56 / 0,5): the comma is the decimal separator when it comes last.
  const euro = t.includes('.') ? t.lastIndexOf(',') > t.lastIndexOf('.') : /,\d{1,2}$/.test(t) || /^0,\d+$/.test(t)
  if (euro) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/[,\s]/g, '')
  const v = parseFloat(t)
  return isNaN(v) ? NaN : neg ? -v : v
}

export function parseDate(s: string | undefined, dayFirst: boolean): Date | null {
  if (!s) return null
  const t = s.trim()
  if (!t) return null
  if (/^\d{10}$/.test(t)) return new Date(+t * 1000)
  if (/^\d{13}$/.test(t)) return new Date(+t)
  let m = t.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) {
    if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(t)) { const d = new Date(t.replace(' ', 'T')); if (!isNaN(+d)) return d }
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
  }
  m = t.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})(?:[,T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i)
  if (m) {
    let a = +m[1], b = +m[2]
    let day = dayFirst ? a : b, mon = dayFirst ? b : a
    if (mon > 12 && day <= 12) [day, mon] = [mon, day]
    let y = +m[3]; if (y < 100) y += 2000
    let h = +(m[4] || 0)
    if (m[7]) { const pm = /pm/i.test(m[7]); h = (h % 12) + (pm ? 12 : 0) }
    return new Date(y, mon - 1, day, h, +(m[5] || 0), +(m[6] || 0))
  }
  const d = new Date(t)
  return isNaN(+d) ? null : d
}

const sideOf = (s: string | undefined): 'long' | 'short' | null => {
  const t = (s || '').toLowerCase().trim()
  if (/^(b|buy|long|bot|bought)\b/.test(t) || t.includes('buy') || t.includes('long')) return 'long'
  if (/^(s|sell|short|sld|sold)\b/.test(t) || t.includes('sell') || t.includes('short')) return 'short'
  return null
}

const blank = (accountId: string, source: string): Pick<Trade, 'id' | 'accountId' | 'tags' | 'mistakes' | 'notes' | 'images' | 'source'> => ({
  id: uid(), accountId, tags: [], mistakes: [], notes: '', images: [], source,
})
const round2 = (x: number) => Math.round(x * 100) / 100

export interface ImportResult { trades: Trade[]; skipped: number; errors: string[] }

export function buildTrades(p: Parsed, accountId: string, dayFirst: boolean): ImportResult {
  const col = (r: string[], f: Field) => (p.mapping[f] === undefined ? undefined : r[p.mapping[f]!])
  const errors: string[] = []
  let skipped = 0
  const trades: Trade[] = []
  const need = (fields: Field[]) => {
    const miss = fields.filter((f) => p.mapping[f] === undefined)
    if (miss.length) throw new Error('Missing column mapping for: ' + miss.map((f) => FIELD_LABELS[f]).join(', '))
  }

  if (p.mode === 'executions') {
    need(['symbol', 'side', 'qty', 'price', 'time'])
    const fills: (Execution & { symbol: string; fee: number })[] = []
    for (const r of p.rows) {
      const side = sideOf(col(r, 'side'))
      const qty = Math.abs(parseNumber(col(r, 'qty')))
      const price = parseNumber(col(r, 'price'))
      const time = parseDate(col(r, 'time'), dayFirst)
      const symbol = (col(r, 'symbol') || '').trim()
      if (!side || !qty || isNaN(price) || !time || !symbol) { skipped++; continue }
      fills.push({ symbol, side: side === 'long' ? 'buy' : 'sell', qty, price, time: time.toISOString(), fee: Math.abs(parseNumber(col(r, 'fees')) || 0) })
    }
    trades.push(...fillsToTrades(fills, accountId, p.format))
    return { trades, skipped, errors }
  }

  // Tradovate's Performance report splits one round trip into several rows (one per matched pair of
  // fills). When the fill ids are present, rebuild the real fills and pair them into whole trades.
  const hn = p.headers.map(norm)
  const bi = hn.indexOf('buyfillid'), si = hn.indexOf('sellfillid')
  if (p.mode === 'buysell' && bi >= 0 && si >= 0) {
    need(['symbol', 'qty', 'buyPrice', 'sellPrice', 'buyTime', 'sellTime'])
    const fills = new Map<string, Execution & { symbol: string }>()
    const mult = new Map<string, number>()
    for (const r of p.rows) {
      const symbol = (col(r, 'symbol') || '').trim().toUpperCase()
      const qty = Math.abs(parseNumber(col(r, 'qty')))
      const bp = parseNumber(col(r, 'buyPrice')), sp = parseNumber(col(r, 'sellPrice'))
      const bt = parseDate(col(r, 'buyTime'), false), st = parseDate(col(r, 'sellTime'), false)
      if (!symbol || !qty || isNaN(bp) || isNaN(sp) || !bt || !st || !r[bi] || !r[si]) { skipped++; continue }
      const add = (id: string, side: 'buy' | 'sell', price: number, time: Date) => {
        const key = `${symbol}|${side}|${id}`
        const f = fills.get(key)
        if (f) f.qty += qty
        else fills.set(key, { symbol, side, qty, price, time: time.toISOString() })
      }
      add(r[bi], 'buy', bp, bt)
      add(r[si], 'sell', sp, st)
      const pnl = parseNumber(col(r, 'pnl'))
      if (!isNaN(pnl) && sp !== bp) { const m = pnl / ((sp - bp) * qty); if (m > 0 && isFinite(m)) mult.set(symbol, +m.toPrecision(6)) }
    }
    trades.push(...fillsToTrades([...fills.values()], accountId, p.format, (s) => mult.get(s.toUpperCase())))
    return { trades, skipped, errors }
  }

  if (p.mode === 'buysell') need(['symbol', 'qty'])
  else need(['symbol', 'entryTime'])

  for (const r of p.rows) {
    const symbol = (col(r, 'symbol') || '').trim()
    if (!symbol) { skipped++; continue }
    let side: 'long' | 'short' | null, entryTime: Date | null, exitTime: Date | null, entryPrice: number, exitPrice: number
    if (p.mode === 'buysell') {
      const bt = parseDate(col(r, 'buyTime'), false), st = parseDate(col(r, 'sellTime'), false)
      if (!bt || !st) { skipped++; continue }
      side = bt <= st ? 'long' : 'short'
      entryTime = side === 'long' ? bt : st; exitTime = side === 'long' ? st : bt
      const bp = parseNumber(col(r, 'buyPrice')), sp = parseNumber(col(r, 'sellPrice'))
      entryPrice = side === 'long' ? bp : sp; exitPrice = side === 'long' ? sp : bp
    } else {
      side = sideOf(col(r, 'side'))
      entryTime = parseDate(col(r, 'entryTime'), dayFirst)
      exitTime = parseDate(col(r, 'exitTime'), dayFirst) || entryTime
      entryPrice = parseNumber(col(r, 'entryPrice')); exitPrice = parseNumber(col(r, 'exitPrice'))
    }
    if (!entryTime || !exitTime) { skipped++; continue } // balance rows, totals, etc.
    const qty = Math.abs(parseNumber(col(r, 'qty'))) || 1
    let pnl = parseNumber(col(r, 'pnl'))
    if (!side) {
      if (!isNaN(pnl) && !isNaN(entryPrice) && !isNaN(exitPrice) && exitPrice !== entryPrice) side = (exitPrice > entryPrice) === (pnl >= 0) ? 'long' : 'short'
      else { skipped++; continue }
    }
    const dir = side === 'long' ? 1 : -1
    let multiplier = guessMultiplier(symbol)
    if (!isNaN(pnl) && !isNaN(entryPrice) && !isNaN(exitPrice) && exitPrice !== entryPrice) {
      const implied = pnl / ((exitPrice - entryPrice) * dir * qty)
      if (implied > 0 && isFinite(implied)) multiplier = +implied.toPrecision(6)
    }
    if (isNaN(pnl)) {
      if (isNaN(entryPrice) || isNaN(exitPrice)) { skipped++; continue }
      pnl = (exitPrice - entryPrice) * dir * qty * multiplier
    }
    const fees = Math.abs(parseNumber(col(r, 'fees')) || 0) - (parseNumber(col(r, 'swap')) || 0)
    const sl = parseNumber(col(r, 'stopLoss')), tp = parseNumber(col(r, 'takeProfit'))
    const mae = parseNumber(col(r, 'mae')), mfe = parseNumber(col(r, 'mfe'))
    trades.push({
      ...blank(accountId, p.format), symbol: symbol.toUpperCase(), side, qty, multiplier,
      entryTime: entryTime.toISOString(), exitTime: exitTime.toISOString(),
      entryPrice: isNaN(entryPrice) ? 0 : entryPrice, exitPrice: isNaN(exitPrice) ? 0 : exitPrice,
      pnl: round2(pnl), fees: round2(fees),
      stopLoss: sl > 0 ? sl : undefined, takeProfit: tp > 0 ? tp : undefined,
      risk: sl > 0 && !isNaN(entryPrice) ? round2(Math.abs(entryPrice - sl) * qty * multiplier) || undefined : undefined,
      mae: !isNaN(mae) ? Math.abs(mae) : undefined, mfe: !isNaN(mfe) ? Math.abs(mfe) : undefined,
      notes: col(r, 'notes') || '',
    })
  }
  return { trades, skipped, errors }
}

/** Turn raw fills into round-trip trades: a trade opens when the position leaves zero and closes when it returns. */
export function fillsToTrades(fills: (Execution & { symbol: string; fee?: number })[], accountId: string, source: string, multOf?: (symbol: string) => number | undefined): Trade[] {
  const bySym = new Map<string, typeof fills>()
  for (const f of fills) {
    if (!bySym.has(f.symbol)) bySym.set(f.symbol, [])
    bySym.get(f.symbol)!.push(f)
  }
  const out: Trade[] = []
  for (const [symbol, list] of bySym) {
    list.sort((a, b) => a.time.localeCompare(b.time))
    const mult = multOf?.(symbol) ?? guessMultiplier(symbol)
    let pos = 0
    let cur: { execs: Execution[]; fee: number; side: 'long' | 'short' } | null = null
    const close = () => {
      if (!cur) return
      const opens = cur.execs.filter((e) => (e.side === 'buy') === (cur!.side === 'long'))
      const closes = cur.execs.filter((e) => (e.side === 'buy') !== (cur!.side === 'long'))
      const q = (a: Execution[]) => a.reduce((s, e) => s + e.qty, 0)
      const v = (a: Execution[]) => a.reduce((s, e) => s + e.qty * e.price, 0)
      const buys = cur.execs.filter((e) => e.side === 'buy'), sells = cur.execs.filter((e) => e.side === 'sell')
      out.push({
        ...blank(accountId, source), symbol: symbol.toUpperCase(), side: cur.side, qty: q(opens), multiplier: mult,
        entryTime: cur.execs[0].time, exitTime: cur.execs[cur.execs.length - 1].time,
        entryPrice: +(v(opens) / q(opens)).toFixed(6), exitPrice: +(v(closes) / q(closes)).toFixed(6),
        pnl: round2((v(sells) - v(buys)) * mult), fees: round2(cur.fee), executions: cur.execs,
      })
      cur = null
    }
    for (const f of list) {
      let remaining = f.qty
      const sign = f.side === 'buy' ? 1 : -1
      while (remaining > 1e-9) {
        if (pos === 0) cur = { execs: [], fee: 0, side: sign > 0 ? 'long' : 'short' }
        const closing = pos !== 0 && Math.sign(pos) !== sign
        const take = closing ? Math.min(remaining, Math.abs(pos)) : remaining
        cur!.execs.push({ time: f.time, side: f.side, qty: take, price: f.price })
        cur!.fee += (f.fee || 0) * (take / f.qty)
        pos = +(pos + sign * take).toFixed(9)
        remaining -= take
        if (pos === 0) close()
      }
    }
    // An unclosed position is left out: it has no realized result yet.
  }
  return out.sort((a, b) => a.exitTime.localeCompare(b.exitTime))
}

export const tradeKey = (t: Trade) => [t.accountId, t.symbol, t.entryTime.slice(0, 19), t.exitTime.slice(0, 19), t.qty, t.entryPrice].join('|')

export function toCsv(trades: Trade[], setupName: (id?: string) => string): string {
  return Papa.unparse(
    trades.map((t) => ({
      Symbol: t.symbol, Side: t.side, Qty: t.qty, 'Entry Time': t.entryTime, 'Exit Time': t.exitTime,
      'Entry Price': t.entryPrice, 'Exit Price': t.exitPrice, 'Gross PnL': t.pnl, Fees: t.fees, 'Net PnL': round2(t.pnl - t.fees),
      'Stop Loss': t.stopLoss ?? '', 'Take Profit': t.takeProfit ?? '', Risk: t.risk ?? '', MAE: t.mae ?? '', MFE: t.mfe ?? '',
      Setup: setupName(t.setupId), Tags: t.tags.join('; '), Mistakes: t.mistakes.join('; '), Rating: t.rating ?? '',
      Emotion: t.emotion ?? '', TradingView: t.tvLink ?? '', Notes: t.notes,
    })),
  )
}
