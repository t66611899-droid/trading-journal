// Tradovate REST sync. Field names follow the official spec at api.tradovate.com.
// On the deployed site the browser calls Tradovate directly (its API allows cross-origin requests);
// in local development requests go through the Vite proxy. The password / API secret are held in
// memory only — never written to storage.
import type { Account, Trade } from './types'
import { fillsToTrades, tradeKey } from './importers'
import { getState, setState } from './store'

export type TvEnv = 'live' | 'demo'
export interface TvCreds { name: string; password: string; appId?: string; appVersion?: string; cid?: string; sec?: string }
export interface TvSession { env: TvEnv; token: string; expires: number; userName: string }
export interface TvAccount { id: number; name: string; active?: boolean }

let session: TvSession | null = null
export const getSession = () => (session && session.expires > Date.now() ? session : null)
export const disconnect = () => { session = null; stopAutoSync() }

const base = (env: TvEnv) => (import.meta.env.DEV ? `/tv-${env}` : `https://${env}.tradovateapi.com/v1`)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function deviceId(): string {
  let id = localStorage.getItem('tj-tv-device')
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('tj-tv-device', id) }
  return id
}

export async function connect(env: TvEnv, creds: TvCreds, onStatus: (s: string) => void = () => {}): Promise<TvSession> {
  const body: Record<string, unknown> = {
    name: creds.name.trim(), password: creds.password, appId: creds.appId?.trim() || 'TradingJournal', appVersion: creds.appVersion?.trim() || '1.0',
    deviceId: deviceId(),
  }
  if (creds.cid?.trim()) body.cid = creds.cid.trim()
  if (creds.sec?.trim()) body.sec = creds.sec.trim()
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response
    try {
      res = await fetch(`${base(env)}/auth/accesstokenrequest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
    } catch {
      throw new Error('Could not reach Tradovate. Check your internet connection and try again.')
    }
    const data = await res.json().catch(() => ({}))
    if (data['p-ticket']) {
      // Time penalty: the server asks to retry after p-time seconds, sending the ticket back.
      if (data['p-captcha']) throw new Error('Tradovate temporarily blocked sign-ins from third-party apps (too many failed attempts). Try again in an hour.')
      const secs = Number(data['p-time']) || 15
      if (attempt > 0 || secs > 90) throw new Error(`Tradovate asks to wait ${secs} seconds before trying again.`)
      onStatus(`Waiting ${secs}s (Tradovate rate limit)…`)
      await wait(secs * 1000 + 500)
      body['p-ticket'] = data['p-ticket']
      continue
    }
    if (data.errorText) throw new Error(`Tradovate: ${data.errorText}`)
    if (!res.ok || !data.accessToken) throw new Error(`Sign-in failed (HTTP ${res.status}).`)
    session = { env, token: data.accessToken, expires: new Date(data.expirationTime).getTime() || Date.now() + 60 * 60000, userName: data.name || creds.name }
    return session
  }
  throw new Error('Sign-in failed.')
}

async function get<T>(s: TvSession, path: string): Promise<T> {
  const res = await fetch(base(s.env) + path, { headers: { Authorization: `Bearer ${s.token}`, Accept: 'application/json' } })
  // Tradovate answers 404 (not only 401) to requests without a valid token.
  if (res.status === 401 || res.status === 404) { session = null; throw new Error('Your Tradovate session expired or was rejected. Please connect again.') }
  if (res.status === 429) throw new Error('Tradovate is rate-limiting requests. Try again in a minute.')
  if (!res.ok) throw new Error(`Tradovate returned error ${res.status} for ${path}`)
  return res.json()
}

async function byIds<T>(s: TvSession, path: string, ids: number[]): Promise<T[]> {
  const out: T[] = []
  const uniq = [...new Set(ids)]
  for (let i = 0; i < uniq.length; i += 100) out.push(...(await get<T[]>(s, `${path}?ids=${uniq.slice(i, i + 100).join(',')}`)))
  return out
}

export const listAccounts = (s: TvSession) => get<TvAccount[]>(s, '/account/list')

interface Fill { id: number; orderId: number; contractId: number; timestamp: string; action: 'Buy' | 'Sell'; qty: number; price: number; active: boolean }
interface Order { id: number; accountId: number }
type FillFee = { id: number } & Record<string, number>
const FEE_FIELDS = ['clearingFee', 'exchangeFee', 'nfaFee', 'brokerageFee', 'ipFee', 'commission', 'orderRoutingFee']

export interface TvRaw { fills: Fill[]; orders: Order[]; fees: FillFee[]; contracts: { id: number; name: string; contractMaturityId: number }[]; maturities: { id: number; productId: number }[]; products: { id: number; valuePerPoint: number }[] }

export async function fetchRaw(s: TvSession): Promise<TvRaw> {
  const [fills, orders, fees] = await Promise.all([get<Fill[]>(s, '/fill/list'), get<Order[]>(s, '/order/list'), get<FillFee[]>(s, '/fillFee/list').catch(() => [] as FillFee[])])
  const contracts = await byIds<TvRaw['contracts'][0]>(s, '/contract/items', fills.map((f) => f.contractId))
  const maturities = await byIds<TvRaw['maturities'][0]>(s, '/contractMaturity/items', contracts.map((c) => c.contractMaturityId)).catch(() => [])
  const products = await byIds<TvRaw['products'][0]>(s, '/product/items', maturities.map((m) => m.productId)).catch(() => [])
  return { fills, orders, fees, contracts, maturities, products }
}

export const journalAccountId = (tvAccountId: number) => `tv-${tvAccountId}`

/** Pure step: raw Tradovate entities -> round-trip trades per selected account. */
export function buildFromRaw(raw: TvRaw, accountIds: number[]): Trade[] {
  const orderAccount = new Map(raw.orders.map((o) => [o.id, o.accountId]))
  const contract = new Map(raw.contracts.map((c) => [c.id, c]))
  const maturity = new Map(raw.maturities.map((m) => [m.id, m.productId]))
  const product = new Map(raw.products.map((p) => [p.id, p.valuePerPoint]))
  // A FillFee shares its id with the fill it belongs to.
  const fee = new Map(raw.fees.map((f) => [f.id, FEE_FIELDS.reduce((s, k) => s + (Number(f[k]) || 0), 0)]))
  const mult = new Map<string, number>()
  const trades: Trade[] = []
  for (const acc of accountIds) {
    const fills = raw.fills
      .filter((f) => f.active !== false && orderAccount.get(f.orderId) === acc && contract.has(f.contractId))
      .map((f) => {
        const c = contract.get(f.contractId)!
        const vpp = product.get(maturity.get(c.contractMaturityId) ?? -1)
        if (vpp) mult.set(c.name, vpp)
        return { symbol: c.name, side: f.action === 'Buy' ? ('buy' as const) : ('sell' as const), qty: f.qty, price: f.price, time: new Date(f.timestamp).toISOString(), fee: fee.get(f.id) ?? 0 }
      })
    trades.push(...fillsToTrades(fills, journalAccountId(acc), 'Tradovate API', (sym) => mult.get(sym)))
  }
  return trades
}

export interface SyncResult { added: number; existing: number; accounts: number; fills: number }

export async function sync(s: TvSession, accounts: TvAccount[]): Promise<SyncResult> {
  const raw = await fetchRaw(s)
  const trades = buildFromRaw(raw, accounts.map((a) => a.id))
  const state = getState()
  const keys = new Set(state.trades.map(tradeKey))
  const fresh = trades.filter((t) => !keys.has(tradeKey(t)))
  const missing: Account[] = accounts
    .filter((a) => !state.accounts.some((x) => x.id === journalAccountId(a.id)))
    .map((a) => ({ id: journalAccountId(a.id), name: a.name, broker: s.env === 'demo' ? 'Tradovate (Demo)' : 'Tradovate', startBalance: 0 }))
  setState((st) => ({ accounts: [...st.accounts, ...missing], trades: [...st.trades, ...fresh] }))
  return { added: fresh.length, existing: trades.length - fresh.length, accounts: accounts.length, fills: raw.fills.length }
}

// ---- auto-sync: keeps pulling new fills while the journal is open, on any page ----
let autoTimer: ReturnType<typeof setInterval> | null = null
let autoInfo: { last: number; added: number; error?: string } = { last: 0, added: 0 }
const autoListeners = new Set<() => void>()
export const autoSyncOn = () => autoTimer !== null
export const autoSyncInfo = () => autoInfo
export const onAutoSync = (l: () => void) => (autoListeners.add(l), () => { autoListeners.delete(l) })

export function stopAutoSync() {
  if (autoTimer) clearInterval(autoTimer)
  autoTimer = null
  autoListeners.forEach((l) => l())
}
export function startAutoSync(accounts: TvAccount[], everyMs = 60000) {
  stopAutoSync()
  autoTimer = setInterval(async () => {
    const s = getSession()
    if (!s) { autoInfo = { ...autoInfo, error: 'Session expired — connect again to resume.' }; return stopAutoSync() }
    if (document.visibilityState === 'hidden') return
    try {
      const r = await sync(s, accounts)
      autoInfo = { last: Date.now(), added: autoInfo.added + r.added }
    } catch (e: any) {
      autoInfo = { ...autoInfo, error: e?.message || String(e) }
      if (!getSession()) return stopAutoSync()
    }
    autoListeners.forEach((l) => l())
  }, everyMs)
  autoListeners.forEach((l) => l())
}
