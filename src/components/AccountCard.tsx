import React, { useState } from 'react'
import { Card, Field } from './ui'
import { cloudEnabled, signIn, signOut, signUp, syncNow, useCloud } from '../lib/cloud'
import { cls } from '../lib/format'

export default function AccountCard() {
  const c = useCloud()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  if (!cloudEnabled) return null
  const run = async (fn: (e: string, p: string) => Promise<string | null>) => {
    setBusy(true); setMsg(null)
    const m = await fn(email, password)
    setMsg(m); setBusy(false)
    if (!m) setPassword('')
  }
  const status = c.status === 'syncing' ? 'Syncing…' : c.status === 'error' ? 'Sync problem' : c.lastSync ? `Synced ${new Date(c.lastSync).toLocaleTimeString()}` : 'Connected'
  return (
    <Card title={<span className="row">Account & sync<span className={cls('chip', c.user && (c.status === 'error' ? 'neg' : 'pos'))}>{c.user ? status : 'Not signed in'}</span></span>}
      right={c.user && <span className="row"><button className="btn ghost sm" onClick={syncNow}>Sync now</button><button className="btn ghost sm" onClick={() => signOut()}>Sign out</button></span>}>
      {c.user ? (
        <div className="muted">Signed in as <b style={{ color: 'var(--text)' }}>{c.user.email}</b>. Your journal is saved to your account and stays the same on every device you sign in on.
          {c.error && <div className="banner err" style={{ marginTop: 10 }}>{c.error}</div>}</div>
      ) : (
        <form className="col" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); run(signIn) }}>
          <div className="row wrap" style={{ alignItems: 'flex-end' }}>
            <Field label="Email" style={{ width: 250 }}><input type="email" className="input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password (6+ characters)" style={{ width: 210 }}><input type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <button className="btn primary" disabled={busy || !email || password.length < 6}>Sign in</button>
            <button type="button" className="btn" disabled={busy || !email || password.length < 6} onClick={() => run(signUp)}>Create account</button>
          </div>
          <div className="faint" style={{ fontSize: 12.5 }}>Sign in to see the same journal on your computer and phone. Without an account, data stays only in this browser.</div>
          {msg && <div className="banner">{msg}</div>}
        </form>
      )}
    </Card>
  )
}
