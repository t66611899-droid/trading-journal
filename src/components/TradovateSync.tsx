import React, { useEffect, useState } from 'react'
import { Card, Field, Seg } from './ui'
import { autoSyncInfo, autoSyncOn, connect, disconnect, getSession, listAccounts, onAutoSync, startAutoSync, stopAutoSync, sync, type TvAccount, type TvEnv } from '../lib/tradovate'
import { cls } from '../lib/format'

const LS = 'tj-tv-login' // only the non-secret fields are remembered

export default function TradovateSync({ onDone }: { onDone: () => void }) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}') } catch { return {} } })()
  const [env, setEnv] = useState<TvEnv>(saved.env || 'live')
  const [name, setName] = useState<string>(saved.name || '')
  const [password, setPassword] = useState('')
  const [cid, setCid] = useState('')
  const [sec, setSec] = useState('')
  const [appId, setAppId] = useState<string>(saved.appId || '')
  const [advanced, setAdvanced] = useState(false)
  const [sess, setSess] = useState(getSession())
  const [accounts, setAccounts] = useState<TvAccount[] | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const loadAccounts = async (s = sess) => {
    if (!s) return
    const list = await listAccounts(s)
    setAccounts(list)
    setPicked(new Set(list.filter((a) => a.active !== false).map((a) => a.id)))
  }
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg(null)
    try { await fn() } catch (e: any) { setMsg({ ok: false, text: e?.message || String(e) }); setSess(getSession()) }
    setBusy('')
  }
  const login = () => run('Connecting…', async () => {
    const s = await connect(env, { name, password, cid, sec, appId }, setBusy)
    localStorage.setItem(LS, JSON.stringify({ env, name, appId }))
    setPassword(''); setSec('')
    setSess(s)
    await loadAccounts(s)
  })
  const doSync = () => run('Syncing…', async () => {
    const r = await sync(sess!, (accounts || []).filter((a) => picked.has(a.id)))
    setMsg({ ok: true, text: r.fills === 0 ? 'Tradovate returned no fills for this account.' : `Read ${r.fills} fills · added ${r.added} new trades${r.existing ? ` · ${r.existing} were already in the journal` : ''}.` })
  })
  const [, tick] = useState(0)
  useEffect(() => onAutoSync(() => tick((x) => x + 1)), [])
  const auto = autoSyncOn(), info = autoSyncInfo()
  const toggleAuto = () => (auto ? stopAutoSync() : startAutoSync((accounts || []).filter((a) => picked.has(a.id))))
  const logout = () => { disconnect(); setSess(null); setAccounts(null); setMsg(null) }

  return (
    <Card title={<span className="row">Tradovate live sync
      <span className={cls('chip', sess ? 'pos' : '')}>{sess ? `Connected · ${sess.userName} · ${sess.env === 'demo' ? 'Demo' : 'Live'}` : 'Not connected'}</span></span>}
      right={sess && <button className="btn ghost sm" onClick={logout}>Disconnect</button>}>
      {!sess ? (
        <form className="col" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); login() }}>
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <Field label="Environment"><Seg value={env} onChange={setEnv} options={[['live', 'Live'], ['demo', 'Demo']]} /></Field>
            <Field label="Tradovate username" style={{ width: 210 }}><input className="input" autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Password" style={{ width: 210 }}><input type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <button className="btn primary" disabled={!name || !password || !!busy}>{busy || 'Connect'}</button>
            <button type="button" className="btn ghost sm" onClick={() => setAdvanced(!advanced)}>{advanced ? 'Hide API key' : 'I have an API key'}</button>
          </div>
          {advanced && (
            <div className="row wrap" style={{ alignItems: 'flex-end' }}>
              <Field label="cid (key ID)" style={{ width: 150 }}><input className="input" value={cid} onChange={(e) => setCid(e.target.value)} /></Field>
              <Field label="sec (key secret)" style={{ width: 300 }}><input type="password" className="input" autoComplete="off" value={sec} onChange={(e) => setSec(e.target.value)} /></Field>
              <Field label="appId (the key's app name)" style={{ width: 220 }}><input className="input" value={appId} onChange={(e) => setAppId(e.target.value)} /></Field>
            </div>
          )}
          <div className="faint" style={{ fontSize: 12.5 }}>
            Read-only: the journal never places orders. Your password and key secret go straight to Tradovate, are kept in memory only, and are cleared right after sign-in.
            If sign-in is rejected, the account may require an API key (Tradovate → Application Settings → API Access).
          </div>
        </form>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          {!accounts ? <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={!!busy} onClick={() => run('Loading accounts…', () => loadAccounts())}>{busy || 'Load accounts'}</button> : (
            <>
              <div className="row wrap">
                {accounts.map((a) => (
                  <label key={a.id} className={cls('chip', picked.has(a.id) && 'accent')} style={{ cursor: 'pointer', padding: '5px 12px' }}>
                    <input type="checkbox" checked={picked.has(a.id)} onChange={() => setPicked((p) => { const n = new Set(p); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n })} />
                    {a.name}
                  </label>
                ))}
                {accounts.length === 0 && <span className="muted">No accounts found for this user.</span>}
              </div>
              <div className="row wrap">
                <button className="btn primary" disabled={!picked.size || !!busy} onClick={doSync}>{busy || 'Sync trades now'}</button>
                <label className="row" style={{ cursor: 'pointer', gap: 6 }}><input type="checkbox" checked={auto} disabled={!picked.size} onChange={toggleAuto} />Auto-sync every minute while the journal is open</label>
                {auto && <span className="chip pos">Live{info.last ? ` · last sync ${new Date(info.last).toLocaleTimeString()} · ${info.added} new` : ''}</span>}
                {info.error && !auto && <span className="chip neg">{info.error}</span>}
              </div>
            </>
          )}
        </div>
      )}
      {msg && <div className={cls('banner', !msg.ok && 'err')} style={{ marginTop: 12 }}>
        <span>{msg.text}</span>{msg.ok && <button className="btn sm" onClick={onDone}>View trades</button>}
      </div>}
    </Card>
  )
}
