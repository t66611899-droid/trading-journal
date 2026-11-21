import { getState } from './store'

const pad = (n: number) => String(n).padStart(2, '0')

export const dayKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const dayKey = (iso: string) => dayKeyOf(new Date(iso))
export const monthKey = (iso: string) => dayKey(iso).slice(0, 7)

export const SYMBOLS: Record<string, string> = { USD: '$', ILS: '₪', EUR: '€', GBP: '£' }

export function money(n: number, digits = 2): string {
  if (!isFinite(n)) return '—'
  const sym = SYMBOLS[getState().settings.currency] ?? '$'
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return `${n < 0 ? '-' : ''}${sym}${abs}`
}
export const money0 = (n: number) => money(n, 0)

export function compact(n: number): string {
  const sym = SYMBOLS[getState().settings.currency] ?? '$'
  const a = Math.abs(n)
  const s = a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'K' : a.toFixed(0)
  return `${n < 0 ? '-' : ''}${sym}${s}`
}

/** Price without floating-point noise (2712.1000000000004 -> 2712.1). */
export const px = (n: number) => (isFinite(n) ? String(+n.toFixed(6)) : '—')
export const pct = (n: number, d = 1) => (isFinite(n) ? `${n.toFixed(d)}%` : '—')
export const num = (n: number, d = 2) => (isFinite(n) ? n.toFixed(d) : n === Infinity ? '∞' : '—')

export function duration(min: number): string {
  if (!isFinite(min)) return '—'
  if (min < 1) return `${Math.round(min * 60)}s`
  if (min < 60) return `${Math.round(min)}m`
  if (min < 1440) return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`
  return `${(min / 1440).toFixed(1)}d`
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MON = MONTHS.map((m) => m.slice(0, 3))

export function dateLong(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return `${WEEKDAYS_SHORT[new Date(y, m - 1, d).getDay()]}, ${MON[m - 1]} ${d}, ${y}`
}
export const shortDate = (key: string) => {
  const [, m, d] = key.split('-')
  return `${MON[+m - 1]} ${+d}`
}
export function dateTime(iso: string): string {
  const d = new Date(iso)
  return `${MON[d.getMonth()]} ${d.getDate()}, ${String(d.getFullYear()).slice(2)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const timeOnly = (iso: string) => {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${dayKeyOf(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fromLocalInput = (s: string) => new Date(s).toISOString()

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
export const cls = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(' ')
export const pnlClass = (n: number) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'muted')
