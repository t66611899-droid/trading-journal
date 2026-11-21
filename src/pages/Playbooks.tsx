import React, { useMemo, useState } from 'react'
import { Card, Field, Icon, Modal, Money } from '../components/ui'
import { setFilters, setState, useStore } from '../lib/store'
import { groupBy, net } from '../lib/stats'
import { num, pct, uid } from '../lib/format'
import type { Playbook } from '../lib/types'
import { useNav } from '../App'

const COLORS = ['#7c5cff', '#2ebd85', '#f0a020', '#5b8cff', '#f5566c', '#22b8cf']

export default function Playbooks() {
  const playbooks = useStore((s) => s.playbooks)
  const trades = useStore((s) => s.trades)
  const nav = useNav()
  const [edit, setEdit] = useState<Playbook | null>(null)
  const stats = useMemo(() => new Map(groupBy(trades, (t) => t.setupId ?? null).map((g) => [g.key, g])), [trades])
  const save = () => {
    if (!edit || !edit.name.trim()) return
    const p = { ...edit, rules: edit.rules.map((r) => r.trim()).filter(Boolean) }
    setState((s) => ({ playbooks: s.playbooks.some((x) => x.id === p.id) ? s.playbooks.map((x) => (x.id === p.id ? p : x)) : [...s.playbooks, p] }))
    setEdit(null)
  }
  const remove = (p: Playbook) => {
    if (!confirm(`Delete the playbook "${p.name}"? Its trades will be kept without a playbook.`)) return
    setState((s) => ({ playbooks: s.playbooks.filter((x) => x.id !== p.id), trades: s.trades.map((t) => (t.setupId === p.id ? { ...t, setupId: undefined, rulesFollowed: [] } : t)) }))
  }
  return (
    <>
      <div className="page-head">
        <div className="muted">Define your setups and their rules, then track how each one performs</div>
        <button className="btn primary" onClick={() => setEdit({ id: uid(), name: '', description: '', rules: [''], color: COLORS[playbooks.length % COLORS.length] })}><Icon name="plus" size={16} />New playbook</button>
      </div>
      {playbooks.length === 0 && <Card><div className="empty">No playbooks yet. Create your first one to start tagging trades with it.</div></Card>}
      <div className="grid g3">
        {playbooks.map((p) => {
          const g = stats.get(p.id)
          const ts = trades.filter((t) => t.setupId === p.id)
          const full = ts.filter((t) => p.rules.length && (t.rulesFollowed || []).length === p.rules.length)
          const partial = ts.filter((t) => p.rules.length && (t.rulesFollowed || []).length < p.rules.length)
          const avgOf = (a: typeof ts) => (a.length ? a.reduce((s, t) => s + net(t), 0) / a.length : 0)
          return (
            <Card key={p.id} style={{ borderTop: `3px solid ${p.color}` }}>
              <div className="row between"><h2>{p.name}</h2>
                <span className="row" style={{ gap: 2 }}>
                  <button className="btn ghost sm" onClick={() => setEdit(p)}>Edit</button>
                  <button className="btn ghost sm" onClick={() => remove(p)}><Icon name="trash" size={15} /></button>
                </span></div>
              <div className="muted" style={{ minHeight: 22 }}>{p.description}</div>
              <div className="grid g2" style={{ gap: 8, margin: '12px 0' }}>
                <div><div className="stat-label">Net P&L</div><b style={{ fontSize: 18 }}><Money v={g?.net ?? 0} digits={0} /></b></div>
                <div><div className="stat-label">Win rate</div><b style={{ fontSize: 18 }} className="num">{g ? pct(g.winRate) : '—'}</b></div>
                <div><div className="stat-label">Trades</div><b className="num">{g?.count ?? 0}</b></div>
                <div><div className="stat-label">Profit factor</div><b className="num">{g ? num(g.profitFactor) : '—'}</b></div>
              </div>
              {p.rules.length > 0 && <>
                <div className="stat-label" style={{ marginBottom: 4 }}>Rules</div>
                <ol style={{ margin: 0, paddingLeft: 18 }} className="muted">{p.rules.map((r) => <li key={r}>{r}</li>)}</ol>
              </>}
              {full.length + partial.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="kv"><span>Avg when all rules followed ({full.length})</span><Money v={avgOf(full)} digits={0} /></div>
                  <div className="kv"><span>Avg when a rule was broken ({partial.length})</span><Money v={avgOf(partial)} digits={0} /></div>
                </div>
              )}
              <button className="btn sm" style={{ marginTop: 12 }} onClick={() => { setFilters({ setupId: p.id }); nav.go('trades') }}>View trades</button>
            </Card>
          )
        })}
      </div>
      {edit && (
        <Modal title={playbooks.some((p) => p.id === edit.id) ? 'Edit playbook' : 'New playbook'} onClose={() => setEdit(null)}
          footer={<><button className="btn primary" onClick={save}>Save</button><button className="btn" onClick={() => setEdit(null)}>Cancel</button></>}>
          <div className="col" style={{ gap: 12 }}>
            <Field label="Name"><input className="input" autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Description"><textarea className="input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Color"><div className="row">{COLORS.map((c) => <button key={c} onClick={() => setEdit({ ...edit, color: c })} style={{ width: 26, height: 26, borderRadius: 8, background: c, border: edit.color === c ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }} />)}</div></Field>
            <Field label="Rules (checklist for every trade)">
              <div className="col" style={{ gap: 6 }}>
                {edit.rules.map((r, i) => (
                  <div className="row" key={i}>
                    <input className="input" value={r} placeholder={`Rule ${i + 1}`} onChange={(e) => setEdit({ ...edit, rules: edit.rules.map((x, j) => (j === i ? e.target.value : x)) })} />
                    <button className="btn ghost sm" onClick={() => setEdit({ ...edit, rules: edit.rules.filter((_, j) => j !== i) })}><Icon name="x" size={15} /></button>
                  </div>
                ))}
                <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit({ ...edit, rules: [...edit.rules, ''] })}><Icon name="plus" size={14} />Add rule</button>
              </div>
            </Field>
          </div>
        </Modal>
      )}
    </>
  )
}
