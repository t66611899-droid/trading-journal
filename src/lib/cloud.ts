// Cloud account + sync (Supabase). The whole journal is one document per user; devices pull it when
// they open or regain focus and push after every change. Screenshots sync one row per image.
import { useSyncExternalStore } from 'react'
import { createClient, type User } from '@supabase/supabase-js'
import { allImages, getState, hooks, replaceFromCloud, snapshot } from './store'
import type { AppState } from './types'
import { tradeKey } from './importers'
import { SUPABASE_KEY, SUPABASE_URL } from './cloudConfig'

export const cloudEnabled = !!SUPABASE_URL && !!SUPABASE_KEY
const sb = cloudEnabled ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

export interface CloudState { user: User | null; status: 'off' | 'syncing' | 'synced' | 'error'; error?: string; lastSync?: number }
let cs: CloudState = { user: null, status: 'off' }
const listeners = new Set<() => void>()
const setCs = (p: Partial<CloudState>) => { cs = { ...cs, ...p }; listeners.forEach((l) => l()) }
export const useCloud = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => cs)

// What this device last saw in the cloud, and whether it has changes that were not pushed yet.
interface Meta { userId?: string; remoteAt?: string; dirty?: boolean }
const META = 'tj-cloud'
const meta = (): Meta => { try { return JSON.parse(localStorage.getItem(META) || '{}') } catch { return {} } }
const setMeta = (m: Partial<Meta>) => localStorage.setItem(META, JSON.stringify({ ...meta(), ...m }))

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
  const trades = byId(local.trades.filter((t) => !t.demo), remote.trades)
  const seen = new Set<string>()
  return {
    accounts: byId(local.accounts, remote.accounts),
    trades: trades.filter((t) => { const k = tradeKey(t); if (seen.has(k)) return false; seen.add(k); return true }),
    playbooks: byId(local.playbooks.filter((p) => !p.id.startsWith('demo-')), remote.playbooks),
    dayNotes: { ...local.dayNotes, ...remote.dayNotes },
    settings: { ...local.settings, ...remote.settings },
  }
}

let busy = false, again = false, pushTimer: any, pollTimer: any

async function push(): Promise<void> {
  const user = cs.user
  if (!sb || !user) return
  const m = meta()
  const row = { user_id: user.id, data: cloudDoc(), updated_at: new Date().toISOString() }
  let res
  if (m.userId === user.id && m.remoteAt) {
    // Only overwrite the version this device last saw; if another device wrote in between, merge instead.
    res = await sb.from('journals').update(row).eq('user_id', user.id).eq('updated_at', m.remoteAt).select('updated_at')
    if (!res.error && res.data.length === 0) return pull(true)
  } else {
    res = await sb.from('journals').upsert(row).select('updated_at')
  }
  if (res.error) throw res.error
  setMeta({ userId: user.id, remoteAt: res.data[0].updated_at, dirty: false })
}

async function pull(conflict = false): Promise<void> {
  const user = cs.user
  if (!sb || !user) return
  const { data, error } = await sb.from('journals').select('data, updated_at').eq('user_id', user.id).maybeSingle()
  if (error) throw error
  const m = meta()
  const mine = m.userId === user.id
  if (!data) { setMeta({ userId: user.id, remoteAt: undefined }); await uploadAllImages(); return push() }
  if (mine && data.updated_at === m.remoteAt && !conflict) { if (m.dirty) await push(); return }
  const local = snapshot()
  const takeRemote = (mine && !m.dirty && !conflict) || !hasRealData(local)
  replaceFromCloud(takeRemote ? data.data : mergeDocs(local, data.data))
  setMeta({ userId: user.id, remoteAt: data.updated_at, dirty: !takeRemote })
  if (!takeRemote) { await uploadAllImages(); await push() }
}

/** Run one sync pass; calls made while one is running are folded into a single follow-up pass. */
export async function syncNow(): Promise<void> {
  if (!cs.user) return
  if (busy) { again = true; return }
  busy = true
  setCs({ status: 'syncing', error: undefined })
  try {
    do { again = false; await pull() } while (again)
    setCs({ status: 'synced', lastSync: Date.now() })
  } catch (e: any) {
    setCs({ status: 'error', error: e?.message || String(e) })
  }
  busy = false
}

async function uploadAllImages() {
  const user = cs.user
  if (!sb || !user) return
  for (const [id, data] of Object.entries(await allImages())) await sb.from('journal_images').upsert({ user_id: user.id, id, data })
}

function start(user: User) {
  if (cs.user?.id === user.id) return
  setCs({ user })
  hooks.changed = () => { setMeta({ dirty: true }); clearTimeout(pushTimer); pushTimer = setTimeout(syncNow, 1200) }
  hooks.imagePut = (id, data) => { sb!.from('journal_images').upsert({ user_id: user.id, id, data }).then(() => {}) }
  hooks.imageDel = (id) => { sb!.from('journal_images').delete().eq('user_id', user.id).eq('id', id).then(() => {}) }
  hooks.imageGet = async (id) => (await sb!.from('journal_images').select('data').eq('user_id', user.id).eq('id', id).maybeSingle()).data?.data ?? null
  syncNow()
  clearInterval(pollTimer)
  pollTimer = setInterval(() => document.visibilityState === 'visible' && syncNow(), 30000)
}
function stop() {
  clearInterval(pollTimer); clearTimeout(pushTimer)
  hooks.changed = hooks.imagePut = hooks.imageDel = hooks.imageGet = undefined
  setCs({ user: null, status: 'off', error: undefined })
}

export function initCloud() {
  if (!sb) return
  sb.auth.onAuthStateChange((_e, session) => (session?.user ? start(session.user) : stop()))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncNow())
}

const friendly = (msg: string) =>
  /invalid login/i.test(msg) ? 'Wrong email or password.' : /not confirmed/i.test(msg) ? 'Confirm your email first — check your inbox for the link.' : /already registered/i.test(msg) ? 'This email already has an account. Sign in instead.' : msg

/** Returns a message to show the user, or null when signed in. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await sb!.auth.signInWithPassword({ email: email.trim(), password })
  return error ? friendly(error.message) : null
}
export async function signUp(email: string, password: string): Promise<string | null> {
  const { data, error } = await sb!.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: location.origin + location.pathname } })
  if (error) return friendly(error.message)
  return data.session ? null : 'Account created. Open the confirmation link we emailed you, then sign in here.'
}
export const signOut = () => sb!.auth.signOut()
