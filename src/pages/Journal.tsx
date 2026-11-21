import React, { useMemo, useState } from 'react'
import { Card, Icon, Money } from '../components/ui'
import { Sparkline } from '../components/charts'
import { setState, useFilteredTrades, useStore } from '../lib/store'
import { dailyStats, holdMin, net, type DayStat } from '../lib/stats'
import { cls, dateLong, duration, money, pct, timeOnly } from '../lib/format'
import type { DayNote } from '../lib/types'
import { useNav } from '../App'

const MOODS = ['Great', 'Good', 'Neutral', 'Unfocused', 'Frustrated', 'Tired']

function DayCard({ day, open: initOpen }: { day: DayStat; open: boolean }) {
  const note = useStore((s) => s.dayNotes[day.date])
  const playbooks = useStore((s) => s.playbooks)
  const nav = useNav()
  const [open, setOpen] = useState(initOpen)
  const setNote = (patch: Partial<DayNote>) =>
    setState((s) => ({ dayNotes: { ...s.dayNotes, [day.date]: { plan: '', review: '', ...s.dayNotes[day.date], ...patch } } }))
  const sorted = [...day.trades].sort((a, b) => a.exitTime.localeCompare(b.exitTime))
  let c = 0
  const cum = [0, ...sorted.map((t) => (c += net(t)))]
  const gp = sorted.filter((t) => net(t) > 0).reduce((s, t) => s + net(t), 0)
  const gl = Math.abs(sorted.filter((t) => net(t) < 0).reduce((s, t) => s + net(t), 0))
  const fees = sorted.reduce((s, t) => s + t.fees, 0)
  const stat = (label: string, value: React.ReactNode) => <div><div className="stat-label">{label}</div><b className="num">{value}</b></div>
  return (
    <Card>
      <div className="row between wrap" style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div className="row" style={{ gap: 12 }}>
          <span className="muted" style={{ display: 'flex', transform: open ? 'rotate(90deg)' : undefined }}><Icon name="right" size={16} /></span>
          <h2>{dateLong(day.date)}</h2>
          <span className={cls('chip', day.net > 0 ? 'pos' : day.net < 0 ? 'neg' : '')} style={{ fontWeight: 600, fontSize: 13 }}>Net P&L {money(day.net)}</span>
          {note && (note.plan || note.review) && <span className="chip accent">Notes</span>}
        </div>
        <div className="row wrap" style={{ gap: 26 }}>
          <Sparkline values={cum} />
          {stat('Trades', day.count)}
          {stat('Win rate', pct(day.wins + day.losses ? (day.wins / (day.wins + day.losses)) * 100 : 0, 0))}
          {stat('Profit factor', gl ? (gp / gl).toFixed(2) : '—')}
          {stat('Fees', money(fees, 0))}
        </div>
      </div>
      {open && (
        <div className="grid g2" style={{ marginTop: 18, alignItems: 'start' }}>
          <div className="col" style={{ gap: 12 }}>
            <div className="field"><label>Pre-market plan</label>
              <textarea className="input" value={note?.plan || ''} onChange={(e) => setNote({ plan: e.target.value })} placeholder="Key levels, news, setups to look for, daily loss limit…" /></div>
            <div className="field"><label>Daily recap</label>
              <textarea className="input" value={note?.review || ''} onChange={(e) => setNote({ review: e.target.value })} placeholder="What worked? What didn't? Did I follow the plan?" /></div>
            <div className="field"><label>Mood</label>
              <div className="row wrap" style={{ gap: 6 }}>
                {MOODS.map((m) => <button key={m} className={cls('chip', note?.mood === m && 'accent')} style={{ cursor: 'pointer' }} onClick={() => setNote({ mood: note?.mood === m ? undefined : m })}>{m}</button>)}
              </div></div>
          </div>
          <div>
            <div className="table-wrap" style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
              <table className="t">
                <thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Duration</th><th>Playbook</th><th className="r">Net P&L</th></tr></thead>
                <tbody>
                  {sorted.map((t) => (
                    <tr key={t.id} className="click" onClick={() => nav.openTrade(t.id)}>
                      <td className="num">{timeOnly(t.entryTime)}</td>
                      <td><b>{t.symbol}</b></td>
                      <td>{t.side === 'long' ? 'Long' : 'Short'}</td>
                      <td>{duration(holdMin(t))}</td>
                      <td className="muted">{playbooks.find((p) => p.id === t.setupId)?.name ?? '—'}</td>
                      <td className="r"><b><Money v={net(t)} /></b></td>
                    </tr>
                  ))}
                  {sorted.length === 0 && <tr><td colSpan={6} className="muted">No trades on this day</td></tr>}
                </tbody>
              </table>
            </div>
            <button className="btn sm" style={{ marginTop: 10 }} onClick={() => nav.openTrade('new', { entryTime: new Date(day.date + 'T16:30').toISOString(), exitTime: new Date(day.date + 'T16:45').toISOString() })}>
              <Icon name="plus" size={14} />Add trade to this day
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}

export default function Journal() {
  const trades = useFilteredTrades()
  const nav = useNav()
  const days = useMemo(() => dailyStats(trades).reverse(), [trades])
  const [limit, setLimit] = useState(15)
  // A day opened from the calendar may have no trades yet; still show it so notes can be written.
  const focus: DayStat | null = nav.day ? days.find((d) => d.date === nav.day) ?? { date: nav.day, net: 0, count: 0, wins: 0, losses: 0, trades: [] } : null
  const list = focus ? [focus] : days.slice(0, limit)
  return (
    <>
      {focus && <div><button className="btn" onClick={() => nav.go('journal')}><Icon name="left" size={15} />All days</button></div>}
      {list.length === 0 && <Card><div className="empty">No trading days in this range</div></Card>}
      {list.map((d, i) => <DayCard key={d.date} day={d} open={!!focus || i === 0} />)}
      {!focus && days.length > limit && <button className="btn" style={{ alignSelf: 'center' }} onClick={() => setLimit(limit + 15)}>Load more days</button>}
    </>
  )
}
