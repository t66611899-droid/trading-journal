import React from 'react'
import { Card, Field, Icon, Seg } from '../components/ui'
import { clearDemo, hasDemo, loadDemo, setState, useStore, wipeAll } from '../lib/store'
import type { Account, Settings } from '../lib/types'
import { money, uid } from '../lib/format'
import { contractsTraded, setFeeRate } from '../lib/fees'
import { rootSymbol } from '../lib/instruments'

export default function SettingsPage() {
  const accounts = useStore((s) => s.accounts)
  const settings = useStore((s) => s.settings)
  const trades = useStore((s) => s.trades)
  const demo = useStore(hasDemo)
  const setS = (p: Partial<Settings>) => {
    if (p.theme) document.documentElement.dataset.theme = p.theme
    setState((s) => ({ settings: { ...s.settings, ...p } }))
  }
  const setA = (id: string, p: Partial<Account>) => setState((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...p } : a)) }))
  const n = (v: string) => (v === '' ? undefined : +v)
  const removeAccount = (a: Account) => {
    const count = trades.filter((t) => t.accountId === a.id).length
    if (!confirm(`Delete the account "${a.name}"${count ? ` and its ${count} trades` : ''}?`)) return
    setState((s) => ({ accounts: s.accounts.filter((x) => x.id !== a.id), trades: s.trades.filter((t) => t.accountId !== a.id), filters: { ...s.filters, accountId: 'all' } }))
  }
  return (
    <>
      <Card title="Trading accounts" right={<button className="btn sm" onClick={() => setState((s) => ({ accounts: [...s.accounts, { id: uid(), name: `Account ${s.accounts.length + 1}`, broker: '', startBalance: 0 }] }))}><Icon name="plus" size={14} />Add account</button>}>
        <div className="col" style={{ gap: 14 }}>
          {accounts.map((a) => (
            <div key={a.id} className="row wrap" style={{ alignItems: 'flex-end' }}>
              <Field label="Name" style={{ width: 180 }}><input className="input" value={a.name} onChange={(e) => setA(a.id, { name: e.target.value })} /></Field>
              <Field label="Broker / prop firm" style={{ width: 160 }}><input className="input" value={a.broker} onChange={(e) => setA(a.id, { broker: e.target.value })} /></Field>
              <Field label="Starting balance" style={{ width: 130 }}><input type="number" className="input" value={a.startBalance} onChange={(e) => setA(a.id, { startBalance: +e.target.value || 0 })} /></Field>
              <Field label="Profit target" style={{ width: 120 }}><input type="number" className="input" placeholder="optional" value={a.profitTarget ?? ''} onChange={(e) => setA(a.id, { profitTarget: n(e.target.value) })} /></Field>
              <Field label="Max daily loss" style={{ width: 120 }}><input type="number" className="input" placeholder="optional" value={a.maxDailyLoss ?? ''} onChange={(e) => setA(a.id, { maxDailyLoss: n(e.target.value) })} /></Field>
              <Field label="Max drawdown" style={{ width: 120 }}><input type="number" className="input" placeholder="optional" value={a.maxDrawdown ?? ''} onChange={(e) => setA(a.id, { maxDrawdown: n(e.target.value) })} /></Field>
              <span className="muted" style={{ paddingBottom: 8 }}>{trades.filter((t) => t.accountId === a.id).length} trades</span>
              {accounts.length > 1 && <button className="btn ghost sm danger" style={{ marginBottom: 3 }} onClick={() => removeAccount(a)}><Icon name="trash" size={15} /></button>}
            </div>
          ))}
          <div className="faint" style={{ fontSize: 12.5 }}>Profit target, daily loss and drawdown are optional. Filling them in adds a prop-firm style rules tracker to the dashboard.</div>
        </div>
      </Card>
      <Card title="Commissions & fees" right={<span className="muted">{trades.filter((t) => t.feesAuto).length} trades use these rates · total fees {money(trades.reduce((x, t) => x + (t.fees || 0), 0))}</span>}>
        <div className="row wrap" style={{ alignItems: 'flex-end', gap: 14 }}>
          {['*', ...new Set(trades.map((t) => rootSymbol(t.symbol)))].map((k) => (
            <Field key={k} label={k === '*' ? 'Default (all symbols)' : `${k} · ${trades.filter((t) => rootSymbol(t.symbol) === k).reduce((x, t) => x + contractsTraded(t), 0)} contracts`} style={{ width: 170 }}>
              <input type="number" step="0.01" min={0} className="input" placeholder={k === '*' ? '0.00' : 'use default'} value={settings.feeRates?.[k] ?? ''} onChange={(e) => setFeeRate(k, e.target.value === '' ? undefined : +e.target.value)} />
            </Field>
          ))}
        </div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>All-in cost per contract, per side (commission + exchange, clearing and NFA fees). Applied to trades that arrive without fees, such as Tradovate's Performance report; fees reported by the broker or typed in by hand are never overwritten.</div>
      </Card>
      <Card title="Preferences">
        <div className="row wrap" style={{ alignItems: 'flex-end', gap: 22 }}>
          <Field label="Currency"><Seg value={settings.currency} onChange={(currency) => setS({ currency })} options={[['USD', '$ USD'], ['ILS', '₪ ILS'], ['EUR', '€ EUR'], ['GBP', '£ GBP']]} /></Field>
          <Field label="Theme"><Seg value={settings.theme} onChange={(theme) => setS({ theme })} options={[['light', 'Light'], ['dark', 'Dark']]} /></Field>
          <Field label="Default import date format"><Seg value={settings.dayFirst ? 'd' : 'm'} onChange={(v) => setS({ dayFirst: v === 'd' })} options={[['m', 'MM/DD'], ['d', 'DD/MM']]} /></Field>
          <Field label="Breakeven threshold (net P&L within ± this amount is not a win or loss)" style={{ width: 400 }}>
            <input type="number" className="input" min={0} value={settings.breakeven} onChange={(e) => setS({ breakeven: Math.max(0, +e.target.value || 0) })} />
          </Field>
        </div>
      </Card>
      <Card title="Data">
        <div className="row wrap">
          {demo ? <button className="btn" onClick={clearDemo}>Clear sample data</button> : <button className="btn" onClick={loadDemo}>Load sample data</button>}
          <button className="btn danger" onClick={() => confirm('Delete all trades, notes, playbooks and screenshots? This cannot be undone without a backup file.') && wipeAll()}><Icon name="trash" size={15} />Delete all data</button>
          <span className="muted">Data is stored only in this browser. Download a backup from Import &amp; Sync from time to time.</span>
        </div>
      </Card>
    </>
  )
}
