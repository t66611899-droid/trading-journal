import React, { useMemo, useState } from 'react'
import { Card, download, Icon, Money } from '../components/ui'
import { deleteTrades, useFilteredTrades, useStore } from '../lib/store'
import { holdMin, net, outcome, rMultiple } from '../lib/stats'
import { cls, dateTime, duration, num, px } from '../lib/format'
import { toCsv } from '../lib/importers'
import type { Trade } from '../lib/types'
import { useNav } from '../App'

type Col = { key: string; label: string; right?: boolean; get: (t: Trade) => number | string; render: (t: Trade) => React.ReactNode }
const STATUS = { win: ['WIN', 'pos'], loss: ['LOSS', 'neg'], be: ['BE', ''] } as const

export default function Trades() {
  const trades = useFilteredTrades()
  const playbooks = useStore((s) => s.playbooks)
  const nav = useNav()
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'open', dir: -1 })
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const PER = 50
  const setupName = (id?: string) => playbooks.find((p) => p.id === id)?.name ?? ''

  const cols: Col[] = [
    { key: 'open', label: 'Open date', get: (t) => t.entryTime, render: (t) => <span className="num">{dateTime(t.entryTime)}</span> },
    { key: 'symbol', label: 'Symbol', get: (t) => t.symbol, render: (t) => <b>{t.symbol}</b> },
    { key: 'status', label: 'Status', get: (t) => outcome(t), render: (t) => { const [l, c] = STATUS[outcome(t)]; return <span className={cls('chip', c)} style={{ fontWeight: 600 }}>{l}</span> } },
    { key: 'side', label: 'Side', get: (t) => t.side, render: (t) => (t.side === 'long' ? 'Long' : 'Short') },
    { key: 'qty', label: 'Qty', right: true, get: (t) => t.qty, render: (t) => <span className="num">{t.qty}</span> },
    { key: 'entry', label: 'Entry price', right: true, get: (t) => t.entryPrice, render: (t) => <span className="num">{px(t.entryPrice)}</span> },
    { key: 'exitp', label: 'Exit price', right: true, get: (t) => t.exitPrice, render: (t) => <span className="num">{px(t.exitPrice)}</span> },
    { key: 'hold', label: 'Duration', right: true, get: holdMin, render: (t) => duration(holdMin(t)) },
    { key: 'net', label: 'Net P&L', right: true, get: net, render: (t) => <b><Money v={net(t)} /></b> },
    { key: 'r', label: 'R-multiple', right: true, get: (t) => rMultiple(t) ?? -999, render: (t) => { const r = rMultiple(t); return r === null ? <span className="faint">—</span> : <span className={cls('num', r >= 0 ? 'pos' : 'neg')}>{num(r)}R</span> } },
    { key: 'setup', label: 'Playbook', get: (t) => setupName(t.setupId), render: (t) => (t.setupId ? setupName(t.setupId) : <span className="faint">—</span>) },
  ]

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = s ? trades.filter((t) => [t.symbol, t.notes, ...t.tags, ...t.mistakes, setupName(t.setupId)].join(' ').toLowerCase().includes(s)) : trades
    const col = cols.find((c) => c.key === sort.key)!
    return [...list].sort((a, b) => {
      const x = col.get(a), y = col.get(b)
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
    })
  }, [trades, sort, q, playbooks])
  const pageRows = rows.slice(page * PER, (page + 1) * PER)
  const pages = Math.ceil(rows.length / PER)
  const total = rows.reduce((s, t) => s + net(t), 0)
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allOn = pageRows.length > 0 && pageRows.every((t) => sel.has(t.id))

  return (
    <>
      <div className="page-head">
        <div className="muted">{rows.length} trades · Net P&L <b><Money v={total} /></b></div>
        <div className="row wrap">
          <input className="input" style={{ width: 230 }} placeholder="Search symbol, notes, tags…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} />
          {sel.size > 0 && <button className="btn danger" onClick={() => { if (confirm(`Delete ${sel.size} trade(s)?`)) { deleteTrades([...sel]); setSel(new Set()) } }}><Icon name="trash" size={15} />Delete {sel.size}</button>}
          <button className="btn" onClick={() => download('trades.csv', toCsv(rows, setupName), 'text/csv')}><Icon name="download" size={15} />Export CSV</button>
        </div>
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {rows.length === 0 ? <div className="empty">No trades found</div> : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th style={{ width: 36 }}><input type="checkbox" checked={allOn} onChange={() => setSel((p) => { const n = new Set(p); pageRows.forEach((t) => (allOn ? n.delete(t.id) : n.add(t.id))); return n })} /></th>
                  {cols.map((c) => (
                    <th key={c.key} className={cls('sortable', c.right && 'r')} onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (-s.dir as 1 | -1) : -1 }))}>
                      {c.label}{sort.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => (
                  <tr key={t.id} className="click" onClick={() => nav.openTrade(t.id)}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} /></td>
                    {cols.map((c) => <td key={c.key} className={cls(c.right && 'r')}>{c.render(t)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {pages > 1 && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted">Page {page + 1} of {pages}</span>
          <button className="btn sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </>
  )
}
