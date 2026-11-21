import React, { useMemo } from 'react'
import type { DayStat } from '../lib/stats'
import { cls, compact, dayKeyOf, WEEKDAYS_SHORT } from '../lib/format'

export function monthCells(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  // Drop a trailing week that is entirely in the next month.
  return cells[35].getMonth() !== month ? cells.slice(0, 35) : cells
}

export default function MonthCalendar({ year, month, days, onDay, compact: small }: { year: number; month: number; days: DayStat[]; onDay: (date: string) => void; compact?: boolean }) {
  const map = useMemo(() => new Map(days.map((d) => [d.date, d])), [days])
  const cells = monthCells(year, month)
  const today = dayKeyOf(new Date())
  const weeks: Date[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return (
    <div className={cls('cal', small && 'compact')}>
      {WEEKDAYS_SHORT.map((d) => <div key={d} className="cal-h">{d}</div>)}
      <div className="cal-h">Week</div>
      {weeks.map((week, wi) => {
        const inMonth = week.filter((d) => d.getMonth() === month).map((d) => map.get(dayKeyOf(d))).filter(Boolean) as DayStat[]
        const wNet = inMonth.reduce((s, d) => s + d.net, 0)
        return (
          <React.Fragment key={wi}>
            {week.map((d) => {
              const k = dayKeyOf(d)
              const s = map.get(k)
              const out = d.getMonth() !== month
              return (
                <div key={k} className={cls('cal-d', out && 'out', k === today && 'today', s && !out && (s.net > 0 ? 'win' : s.net < 0 ? 'loss' : ''))} onClick={() => onDay(k)}>
                  <span className="dn">{d.getDate()}</span>
                  {s && !out && (
                    <div>
                      <div className={cls('dp num', s.net >= 0 ? 'pos' : 'neg')}>{compact(s.net)}</div>
                      <div className="dc">{s.count} {s.count === 1 ? 'trade' : 'trades'}</div>
                    </div>
                  )}
                </div>
              )
            })}
            <div className="cal-d cal-w">
              <span className="dn">Week {wi + 1}</span>
              {inMonth.length > 0 && (
                <div>
                  <div className={cls('dp num', wNet >= 0 ? 'pos' : 'neg')}>{compact(wNet)}</div>
                  <div className="dc">{inMonth.length} {inMonth.length === 1 ? 'day' : 'days'}</div>
                </div>
              )}
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}
