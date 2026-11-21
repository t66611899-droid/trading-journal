import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { get, set, del, keys } from 'idb-keyval'
import type { AppState, Filters, Trade } from './types'
import { makeDemo } from './demo'

const KEY = 'tj-state-v1'
const IMG = 'tj-img:'

export const defaultFilters = (): Filters => ({ accountId: 'all', range: 'all', symbol: '', side: 'all', setupId: '', tag: '' })

const emptyState = (): AppState => ({
  accounts: [{ id: 'main', name: 'Main account', broker: '', startBalance: 50000 }],
  trades: [],
  playbooks: [],
  dayNotes: {},
  settings: { currency: 'USD', theme: 'light', breakeven: 0, dayFirst: true },
  filters: defaultFilters(),
})

let state: AppState = emptyState()
const listeners = new Set<() => void>()
let timer: any

function persist() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    const { filters, ...rest } = state
    set(KEY, rest).catch((e) => console.error('Save failed', e))
  }, 250)
}

export const getState = () => state
// Cloud sync plugs in here without the store depending on it.
export const hooks: {
  changed?: () => void
  imagePut?: (id: string, data: string) => void
  imageDel?: (id: string) => void
  imageGet?: (id: string) => Promise<string | null>
} = {}
/** Everything that is saved (and synced): the state without the per-session filters. */
export function snapshot(): Omit<AppState, 'filters'> {
  const { filters, ...rest } = state
  return rest
}
/** Replace the journal with data that came from the cloud, without marking it as a local change. */
export function replaceFromCloud(data: Partial<AppState>) {
  set(KEY + '-before-sync', snapshot()).catch(() => {}) // safety copy of what this device had
  state = { ...emptyState(), ...data, settings: { ...emptyState().settings, ...data.settings }, filters: state.filters }
  document.documentElement.dataset.theme = state.settings.theme
  listeners.forEach((l) => l())
  persist()
}
export async function allImages(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const k of await keys()) if (typeof k === 'string' && k.startsWith(IMG)) out[k.slice(IMG.length)] = await get(k)
  return out
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  listeners.forEach((l) => l())
  persist()
  hooks.changed?.()
}
export function useStore<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => sel(state),
  )
}

export async function initStore() {
  const saved = await get(KEY).catch(() => null)
  if (saved) state = { ...emptyState(), ...saved, settings: { ...emptyState().settings, ...saved.settings }, filters: defaultFilters() }
  else state = { ...emptyState(), ...makeDemo() }
  // One-time switch to the light, English layout for journals saved before the redesign.
  if (!(state.settings as any).uiV2) state = { ...state, settings: { ...state.settings, theme: 'light', uiV2: true } as any, accounts: state.accounts.map((a) => (a.name === 'חשבון ראשי' ? { ...a, name: 'Main account' } : a)), ...(state.trades.length && state.trades.every((t) => t.demo) ? makeDemo() : {}) }
  if (saved) persist()
  document.documentElement.dataset.theme = state.settings.theme
}

// ---- actions ----
export const upsertTrade = (t: Trade) =>
  setState((s) => ({ trades: s.trades.some((x) => x.id === t.id) ? s.trades.map((x) => (x.id === t.id ? t : x)) : [...s.trades, t] }))

export function deleteTrades(ids: string[]) {
  const idset = new Set(ids)
  state.trades.filter((t) => idset.has(t.id)).forEach((t) => t.images.forEach((i) => del(IMG + i)))
  setState((s) => ({ trades: s.trades.filter((t) => !idset.has(t.id)) }))
}
export const setFilters = (f: Partial<Filters>) => setState((s) => ({ filters: { ...s.filters, ...f } }))
export const hasDemo = (s: AppState) => s.trades.some((t) => t.demo)
export const clearDemo = () =>
  setState((s) => ({ trades: s.trades.filter((t) => !t.demo), playbooks: s.playbooks.filter((p) => !p.id.startsWith('demo-')) }))
export function loadDemo() {
  const d = makeDemo()
  setState((s) => ({
    trades: [...s.trades.filter((t) => !t.demo), ...d.trades.map((t) => ({ ...t, accountId: s.accounts[0].id }))],
    playbooks: [...s.playbooks.filter((p) => !p.id.startsWith('demo-')), ...d.playbooks],
  }))
}

// ---- filtering ----
const pad = (n: number) => String(n).padStart(2, '0')
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function rangeBounds(f: Filters): [string, string] {
  const now = new Date()
  const back = (n: number) => key(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n + 1))
  switch (f.range) {
    case '7d': return [back(7), '9999']
    case '30d': return [back(30), '9999']
    case '90d': return [back(90), '9999']
    case 'ytd': return [`${now.getFullYear()}-01-01`, '9999']
    case 'month': return [`${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, '9999']
    case 'custom': return [f.from || '0000', f.to || '9999']
    default: return ['0000', '9999']
  }
}

export function applyFilters(trades: Trade[], f: Filters): Trade[] {
  const [from, to] = rangeBounds(f)
  const sym = f.symbol.trim().toUpperCase()
  return trades
    .filter((t) => {
      if (f.accountId !== 'all' && t.accountId !== f.accountId) return false
      const k = key(new Date(t.exitTime))
      if (k < from || k > to) return false
      if (sym && !t.symbol.toUpperCase().includes(sym)) return false
      if (f.side !== 'all' && t.side !== f.side) return false
      if (f.setupId && t.setupId !== f.setupId) return false
      if (f.tag && !t.tags.includes(f.tag) && !t.mistakes.includes(f.tag)) return false
      return true
    })
    .sort((a, b) => a.exitTime.localeCompare(b.exitTime))
}

export function useFilteredTrades(): Trade[] {
  const trades = useStore((s) => s.trades)
  const filters = useStore((s) => s.filters)
  return useMemo(() => applyFilters(trades, filters), [trades, filters])
}

/** Starting balance of the accounts currently in view. */
export function useStartBalance(): number {
  const accounts = useStore((s) => s.accounts)
  const accountId = useStore((s) => s.filters.accountId)
  return accounts.filter((a) => accountId === 'all' || a.id === accountId).reduce((s, a) => s + (a.startBalance || 0), 0)
}

// ---- images (stored separately so the main state stays small) ----
export async function saveImage(file: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = rej
    i.src = dataUrl
  })
  const max = 2000
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * scale)
  c.height = Math.round(img.height * scale)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  const out = c.toDataURL('image/jpeg', 0.88)
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36)
  await set(IMG + id, out)
  hooks.imagePut?.(id, out)
  return id
}
export const removeImage = (id: string) => { hooks.imageDel?.(id); return del(IMG + id) }
export function useImage(id: string): string | null {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    get(IMG + id).then(async (v) => {
      // Not on this device yet: fetch it from the cloud once and keep a local copy.
      if (!v && hooks.imageGet) { v = await hooks.imageGet(id); if (v) set(IMG + id, v) }
      if (live) setSrc(v ?? null)
    })
    return () => { live = false }
  }, [id])
  return src
}

// ---- backup ----
export async function exportBackup(): Promise<string> {
  const { filters, ...rest } = state
  const images: Record<string, string> = {}
  for (const k of await keys()) if (typeof k === 'string' && k.startsWith(IMG)) images[k.slice(IMG.length)] = await get(k)
  return JSON.stringify({ app: 'trading-journal', version: 1, exportedAt: new Date().toISOString(), state: rest, images })
}
export async function importBackup(json: string) {
  const data = JSON.parse(json)
  if (data.app !== 'trading-journal' || !data.state?.trades) throw new Error('This is not a journal backup file')
  for (const [id, v] of Object.entries(data.images || {})) await set(IMG + id, v)
  setState({ ...emptyState(), ...data.state, filters: defaultFilters() })
}
export async function wipeAll() {
  for (const k of await keys()) if (typeof k === 'string' && k.startsWith(IMG)) await del(k)
  setState(emptyState())
}
