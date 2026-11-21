export type Side = 'long' | 'short'

export interface Execution {
  time: string // ISO
  side: 'buy' | 'sell'
  qty: number
  price: number
}

export interface Trade {
  id: string
  accountId: string
  symbol: string
  side: Side
  entryTime: string // ISO
  exitTime: string // ISO
  entryPrice: number
  exitPrice: number
  qty: number
  multiplier: number // point value (futures) / contract size
  pnl: number // gross
  fees: number
  feesAuto?: boolean // fees were calculated from the commission rates, not reported by the broker
  stopLoss?: number
  takeProfit?: number
  risk?: number // planned risk in account currency (1R)
  mae?: number // max adverse excursion, in currency (positive number)
  mfe?: number // max favorable excursion, in currency
  setupId?: string
  rulesFollowed?: string[]
  tags: string[]
  mistakes: string[]
  rating?: number // 1-5
  emotion?: string
  notes: string
  tvLink?: string
  images: string[] // image ids in IndexedDB
  executions?: Execution[]
  demo?: boolean
  source?: string
}

export interface Account {
  id: string
  name: string
  broker: string
  startBalance: number
  profitTarget?: number
  maxDailyLoss?: number
  maxDrawdown?: number
}

export interface Playbook {
  id: string
  name: string
  description: string
  rules: string[]
  color: string
}

export interface DayNote {
  plan: string
  review: string
  mood?: string
}

export interface Filters {
  accountId: string // 'all' | id
  range: 'all' | '7d' | '30d' | '90d' | 'ytd' | 'month' | 'custom'
  from?: string // YYYY-MM-DD
  to?: string
  symbol: string
  side: 'all' | Side
  setupId: string
  tag: string
}

export interface Settings {
  currency: string
  theme: 'dark' | 'light'
  breakeven: number // |net pnl| <= this counts as breakeven
  dayFirst: boolean
  feeRates?: Record<string, number> // commission per contract per side, by root symbol ('*' = default)
}

export interface AppState {
  accounts: Account[]
  trades: Trade[]
  playbooks: Playbook[]
  dayNotes: Record<string, DayNote>
  settings: Settings
  filters: Filters
}
