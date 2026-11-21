// Client side of the AI coach: packs a compact picture of the journal and sends it, with the
// conversation, to the server function that holds the AI key.
import { getState } from './store'
import { computeStats, groupBy, holdMin, net, rMultiple, type Group } from './stats'
import { dayKey, timeOnly, WEEKDAYS } from './format'
import { rootSymbol } from './instruments'
import { currentSyncKey } from './cloud'
import { SUPABASE_URL } from './cloudConfig'

export interface ChatMessage { role: 'user' | 'assistant'; content: string }
const r2 = (n: number) => (isFinite(n) ? Math.round(n * 100) / 100 : null)
const rows = (gs: Group[]) => gs.map((g) => ({ label: g.label, trades: g.count, winRate: r2(g.winRate), net: r2(g.net) }))

/** Everything the coach gets to see. Kept small: aggregates plus the most recent trades and day notes. */
export function journalSummary() {
  const s = getState()
  const trades = s.trades.filter((t) => !t.demo).sort((a, b) => a.exitTime.localeCompare(b.exitTime))
  const start = s.accounts.reduce((x, a) => x + (a.startBalance || 0), 0)
  const st = computeStats(trades, start)
  const setup = (id?: string) => s.playbooks.find((p) => p.id === id)
  return {
    currency: s.settings.currency,
    accounts: s.accounts.map((a) => ({ name: a.name, startBalance: a.startBalance, profitTarget: a.profitTarget, maxDailyLoss: a.maxDailyLoss, maxDrawdown: a.maxDrawdown })),
    overall: {
      trades: st.count, tradingDays: st.tradingDays, netPnl: r2(st.net), fees: r2(st.fees), balance: r2(start + st.net),
      winRate: r2(st.winRate), profitFactor: r2(st.profitFactor), avgWin: r2(st.avgWin), avgLoss: r2(-st.avgLoss), expectancy: r2(st.expectancy),
      largestWin: r2(st.largestWin), largestLoss: r2(st.largestLoss), maxDrawdown: r2(st.maxDrawdown), dayWinRate: r2(st.dayWinRate),
      avgHoldWinnersMin: r2(st.avgHoldWin), avgHoldLosersMin: r2(st.avgHoldLoss), maxConsecutiveLosses: st.maxConsecLosses, avgR: st.rCount ? r2(st.avgR) : null,
    },
    byEntryHour: rows(groupBy(trades, (t) => String(new Date(t.entryTime).getHours()), (k) => `${k.padStart(2, '0')}:00`).sort((a, b) => +a.key - +b.key)),
    byWeekday: rows(groupBy(trades, (t) => String(new Date(t.entryTime).getDay()), (k) => WEEKDAYS[+k]).sort((a, b) => +a.key - +b.key)),
    bySymbol: rows(groupBy(trades, (t) => rootSymbol(t.symbol))),
    bySide: rows(groupBy(trades, (t) => t.side)),
    byPlaybook: rows(groupBy(trades, (t) => t.setupId ?? null, (k) => setup(k)?.name ?? k)),
    byMistake: rows(groupBy(trades, (t) => t.mistakes)),
    days: st.days.slice(-15).map((d) => ({ date: d.date, net: r2(d.net), trades: d.count, wins: d.wins, losses: d.losses, ...(s.dayNotes[d.date] ?? {}) })),
    recentTrades: trades.slice(-60).map((t) => {
      const pb = setup(t.setupId)
      return {
        date: dayKey(t.entryTime), time: timeOnly(t.entryTime), symbol: t.symbol, side: t.side, qty: t.qty, net: r2(net(t)), fees: r2(t.fees),
        holdMin: r2(holdMin(t)), r: rMultiple(t) === null ? undefined : r2(rMultiple(t)!), playbook: pb?.name,
        rulesFollowed: pb ? `${(t.rulesFollowed || []).length}/${pb.rules.length}` : undefined,
        mistakes: t.mistakes.length ? t.mistakes : undefined, tags: t.tags.length ? t.tags : undefined,
        emotion: t.emotion, rating: t.rating, notes: t.notes ? t.notes.slice(0, 400) : undefined,
      }
    }),
  }
}

export class CoachNotConfigured extends Error {}

export async function askCoach(messages: ChatMessage[], language: 'he' | 'en'): Promise<string> {
  const key = currentSyncKey()
  if (!key) throw new Error('Turn on sync in Settings first — the coach uses it to recognise your journal.')
  const res = await fetch(`${SUPABASE_URL}/functions/v1/coach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, messages, language, journal: journalSummary() }),
  })
  const data = await res.json().catch(() => ({}))
  if (data.error === 'not_configured') throw new CoachNotConfigured()
  if (!res.ok || !data.text) throw new Error(data.error || `The coach is unavailable (${res.status}).`)
  return data.text
}
