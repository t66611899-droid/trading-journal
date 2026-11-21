// Cross-device sync by secret link. The journal is stored in the cloud under a long random key that
// only this user's devices hold: whoever has the link can open the journal, so it is never shown
// anywhere except in Settings. Devices pull when they open or regain focus and push after each change.
import { useSyncExternalStore } from 'react'
import { allImages, hooks, replaceFromCloud, snapshot } from './store'
import type { AppState } from './types'
import { tradeKey } from './importers'
import { SITE_URL, SUPABASE_KEY, SUPABASE_URL } from './cloudConfig'

export const cloudEnabled = !!SUPABASE_URL && !!SUPABASE_KEY

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Sync failed (${res.status})`)
  return res.status === 204 ? (null as T) : res.json()
}

export interface CloudState { key: string | null; status: 'off' | 'syncing' | 'synced' | 'error'; error?: string; lastSync?: number }
// What this device last saw in the cloud, and whether it has changes that were not pushed yet.
interface Meta { key?: string; remoteAt?: string; dirty?: boolean }
const META = 'tj-sync'
const meta = (): Meta => { try { return JSON.parse(localStorage.getItem(META) || '{}') } catch { return {} } }
const setMeta = (m: Meta) => localStorage.setItem(META, JSON.stringify(m))
const patchMeta = (m: Partial<Meta>) => setMeta({ ...meta(), ...m })

let cs: CloudState = { key: null, status: 'off' }
const listeners = new Set<() => void>()
const setCs = (p: Partial<CloudState>) => { cs = { ...cs, ...p }; listeners.forEach((l) => l()) }
export const useCloud = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => cs)

type Doc = Omit<AppState, 'filters'>
/** What gets uploaded: the journal without the sample data. */
function cloudDoc(): Doc {
  const d = snapshot()
  return { ...d, trades: d.trades.filter((t) => !t.demo), playbooks: d.playbooks.filter((p) => !p.id.startsWith('demo-')) }
}
const hasRealData = (d: Doc) => d.trades.some((t) => !t.demo) || Object.keys(d.dayNotes).length > 0

/** Two devices changed the journal independently: keep everything from both; the cloud copy wins on the same item. */
export function mergeDocs(local: Doc, remote: Doc): Doc {
  const byId = <T extends { id: string }>(a: T[], b: T[]) => [...new Map([...a, ...b].map((x) => [x.id, x])).values()]
  const seen = new Set<string>()
  return {
    accounts: byId(local.accounts, remote.accounts),
    // Cloud trades go first so that, for the same trade imported on two devices, the cloud copy is the one kept.
    trades: [...remote.trades, ...local.trades.filter((t) => !t.demo && !remote.trades.some((r) => r.id === t.id))].filter((t) => { const k = tradeKey(t); if (seen.has(k)) return false; seen.add(k); return true }),
    playbooks: byId(local.playbooks.filter((p) => !p.id.startsWith('demo-')), remote.playbooks),
    dayNotes: { ...local.dayNotes, ...remote.dayNotes },
    settings: { ...local.settings, ...remote.settings },
  }
}

let busy = false, again = false, pushTimer: any, pollTimer: any

async function uploadAllImages(key: string) {
  for (const [id, data] of Object.entries(await allImages())) await rpc('sj_img_put', { p_key: key, p_id: id, p_data: data })
}

async function push(key: string): Promise<void> {
  const m = meta()
  const version = await rpc<string | null>('sj_put', { p_key: key, p_data: cloudDoc(), p_expected: m.remoteAt ?? null })
  if (!version) return pull(key, true) // another device wrote in between: merge, then push again
  patchMeta({ remoteAt: version, dirty: false })
}

async function pull(key: string, conflict = false): Promise<void> {
  const rows = await rpc<{ data: Doc; updated_at: string }[]>('sj_get', { p_key: key })
  const remote = rows[0]
  const m = meta()
  if (!remote) { patchMeta({ remoteAt: undefined }); await push(key); return uploadAllImages(key) }
  if (remote.updated_at === m.remoteAt && !conflict) { if (m.dirty) await push(key); return }
  const local = snapshot()
  // Take the cloud copy as-is unless this device has work of its own that the cloud has not seen.
  const takeRemote = (!!m.remoteAt && !m.dirty && !conflict) || !hasRealData(local)
  replaceFromCloud(takeRemote ? remote.data : mergeDocs(local, remote.data))
  patchMeta({ remoteAt: remote.updated_at, dirty: !takeRemote })
  if (!takeRemote) { await push(key); await uploadAllImages(key) }
}

/** Run one sync pass; calls made while one is running are folded into a single follow-up pass. */
export async function syncNow(): Promise<void> {
  const key = cs.key
  if (!key) return
  if (busy) { again = true; return }
  busy = true
  setCs({ status: 'syncing', error: undefined })
  try {
    do { again = false; await pull(key) } while (again && cs.key === key)
    setCs({ status: 'synced', lastSync: Date.now() })
  } catch (e: any) {
    setCs({ status: 'error', error: e?.message || String(e) })
  }
  busy = false
}

function start(key: string) {
  if (meta().key !== key) setMeta({ key }) // a different journal than this device was linked to: forget the old version marker
  setCs({ key, status: 'syncing', error: undefined })
  hooks.changed = () => { patchMeta({ dirty: true }); clearTimeout(pushTimer); pushTimer = setTimeout(syncNow, 1200) }
  hooks.imagePut = (id, data) => { rpc('sj_img_put', { p_key: key, p_id: id, p_data: data }).catch(() => {}) }
  hooks.imageDel = (id) => { rpc('sj_img_del', { p_key: key, p_id: id }).catch(() => {}) }
  hooks.imageGet = (id) => rpc<string | null>('sj_img_get', { p_key: key, p_id: id }).catch(() => null)
  syncNow()
  clearInterval(pollTimer)
  pollTimer = setInterval(() => document.visibilityState === 'visible' && syncNow(), 20000)
}

/** Turn sync on for this device with a brand-new secret key. */
export function enableSync() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  start(btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
}
const keyFrom = (text: string) => text.trim().match(/(?:#k=|^)([A-Za-z0-9_-]{40,200})$/)?.[1] ?? null
/** Link this device using a sync link (or bare key) copied from another device. */
export function connectWithLink(text: string): boolean {
  const key = keyFrom(text)
  if (key) start(key)
  return !!key
}
export function disconnectSync() {
  clearInterval(pollTimer); clearTimeout(pushTimer)
  hooks.changed = hooks.imagePut = hooks.imageDel = hooks.imageGet = undefined
  localStorage.removeItem(META)
  setCs({ key: null, status: 'off', error: undefined })
}
/** The link to open on another device. It always points at the public site, even when this page is a local copy. */
export const syncLink = () => (cs.key ? `${/^(localhost$|127\.|\[?::1\]?$)/.test(location.hostname) ? SITE_URL : location.origin + location.pathname}#k=${cs.key}` : '')

export const currentSyncKey = () => cs.key

export function initCloud() {
  if (!cloudEnabled) return
  // Opened through a sync link: adopt the key and take it out of the address bar straight away.
  const fromUrl = keyFrom(location.hash)
  if (fromUrl) history.replaceState(null, '', location.pathname + location.search + '#dashboard')
  const key = fromUrl ?? meta().key
  if (key) start(key)
  // A sync link opened while the journal is already open in this tab.
  window.addEventListener('hashchange', () => {
    const k = keyFrom(location.hash)
    if (!k) return
    history.replaceState(null, '', location.pathname + location.search + '#dashboard')
    if (k !== cs.key) start(k)
  })
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncNow())
}
