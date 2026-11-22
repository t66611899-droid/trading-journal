// Chat assistant: answers questions about the journal, runs trading calculations and "what if" checks,
// and hands over to the coach for suggestions. Everything runs in the browser from the trades — free, private.
import type { Account, AppState, Trade } from './types'
import { computeStats, dailyStats, groupBy, net, type Stats } from './stats'
import { coach, type Report, type Topic } from './coach'
import { dayKey, dayKeyOf, MONTHS, WEEKDAYS, money, num, pct, shortDate, timeOnly, dateLong } from './format'
import { guessMultiplier, rootSymbol } from './instruments'

export type Tone = 'pos' | 'neg' | 'warn' | 'info'
export interface Reply { title?: string; text?: string; rows?: [string, string, Tone?][]; bullets?: string[]; chips?: string[]; rtl: boolean }

const HE_RE = /[֐-׿]/
const iso = (s: string) => `⁦${s}⁩`
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)
const tone = (n: number): Tone => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'info')
const TICK: Record<string, number> = { ES: 0.25, MES: 0.25, NQ: 0.25, MNQ: 0.25, YM: 1, MYM: 1, RTY: 0.1, M2K: 0.1, CL: 0.01, MCL: 0.01, GC: 0.1, MGC: 0.1 }
const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

export const STARTERS = {
  he: ['כמה הרווחתי השבוע?', 'מה אחוז ההצלחה שלי?', 'באיזו שעה אני הכי טוב?', 'כמה חוזים MNQ לסיכון 200$ עם סטופ 20 נקודות?', 'כמה מקום נשאר לי בדרואודאון?', 'מה אם הייתי עוצר אחרי 2 הפסדים?', 'מה הכי עולה לי כסף?', 'תן לי הצעות לשיפור'],
  en: ['How much did I make this week?', 'What is my win rate?', 'What is my best hour?', 'How many MNQ contracts to risk $200 with a 20 point stop?', 'How much drawdown room do I have?', 'What if I stopped after 2 losses?', 'What is costing me the most?', 'Give me suggestions'],
}

interface Period { from: string; to: string; he: string; en: string }
const pad = (n: number) => String(n).padStart(2, '0')
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d }

function findPeriod(q: string): Period | null {
  const now = new Date()
  const today = dayKeyOf(now)
  const mk = (from: string, to: string, he: string, en: string): Period => ({ from, to, he, en })
  const monday = (back: number) => { const d = new Date(now); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd - back * 7); return d }
  if (/אתמול|yesterday/.test(q)) { const y = dayKeyOf(daysAgo(1)); return mk(y, y, 'אתמול', 'yesterday') }
  if (/היום|today/.test(q) && !/ימים|days|היום ה?(טוב|גרוע|חלש|כי|רווחי|מפסיד|אחרון)/.test(q)) return mk(today, today, 'היום', 'today')
  if (/שבוע שעבר|שבוע הקודם|last week/.test(q)) { const a = monday(1), b = new Date(a); b.setDate(a.getDate() + 6); return mk(dayKeyOf(a), dayKeyOf(b), 'בשבוע שעבר', 'last week') }
  if (/השבוע|this week|week so far/.test(q)) return mk(dayKeyOf(monday(0)), today, 'השבוע', 'this week')
  if (/חודש שעבר|חודש הקודם|last month/.test(q)) { const a = new Date(now.getFullYear(), now.getMonth() - 1, 1), b = new Date(now.getFullYear(), now.getMonth(), 0); return mk(dayKeyOf(a), dayKeyOf(b), 'בחודש שעבר', 'last month') }
  if (/החודש|this month/.test(q)) return mk(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, today, 'החודש', 'this month')
  if (/השנה|this year|ytd/.test(q)) return mk(`${now.getFullYear()}-01-01`, today, 'השנה', 'this year')
  const lastN = q.match(/(\d+)\s*(?:ימים|days)/)
  if (lastN && /אחרונים|last|past/.test(q)) return mk(dayKeyOf(daysAgo(+lastN[1] - 1)), today, `ב-${lastN[1]} הימים האחרונים`, `in the last ${lastN[1]} days`)
  for (let i = 0; i < 12; i++) {
    if (q.includes(HE_MONTHS[i]) || new RegExp(`\\b${MONTHS[i].toLowerCase()}\\b|\\b${MONTHS[i].slice(0, 3).toLowerCase()}\\b`).test(q)) {
      const y = i > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear()
      return mk(`${y}-${pad(i + 1)}-01`, dayKeyOf(new Date(y, i + 1, 0)), `ב${HE_MONTHS[i]}`, `in ${MONTHS[i]}`)
    }
  }
  const dm = q.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/)
  if (dm && !/[*+]/.test(q)) {
    const y = dm[3] ? (dm[3].length === 2 ? 2000 + +dm[3] : +dm[3]) : now.getFullYear()
    const k = `${y}-${pad(+dm[2])}-${pad(+dm[1])}`
    return mk(k, k, `ב-${dm[1]}/${dm[2]}`, `on ${shortDate(k)}`)
  }
  return null
}
const weekdayAsked = (q: string): number | null => {
  for (let i = 0; i < 7; i++) if (new RegExp(`יום ${HE_DAYS[i]}|ימי ${HE_DAYS[i]}`).test(q) || new RegExp(`\\b${WEEKDAYS[i].toLowerCase()}s?\\b`).test(q)) return i
  return null
}

function symbolIn(q: string, trades: Trade[]): string {
  const tok = q.toUpperCase().match(/\b[A-Z0-9]{1,6}\b/g) || []
  for (const t of tok) if (guessMultiplier(t) > 1) return rootSymbol(t)
  const g = groupBy(trades, (t) => rootSymbol(t.symbol)).sort((a, b) => b.count - a.count)[0]
  return g?.key || 'MNQ'
}
const numAfter = (q: string, words: string) => { const m = q.match(new RegExp(`(?:${words})\\D{0,14}?(\\d+(?:\\.\\d+)?)`)); return m ? +m[1] : null }
const numBefore = (q: string, words: string) => { const m = q.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*\\$?\\s*(?:${words})`)); return m ? +m[1] : null }

function fromReport(r: Report, rtl: boolean, chips: string[]): Reply {
  return { rtl, title: r.headline, bullets: [...r.points.map((p) => p.text), ...r.actions.map((a) => (rtl ? '→ ' : '→ ') + a)], text: r.note, chips }
}

export function ask(input: string, state: AppState): Reply {
  const he = HE_RE.test(input)
  const L = (h: string, e: string) => (he ? h : e)
  const M = (n: number, d = 2) => (he ? iso(money(n, d)) : money(n, d))
  const q = input.toLowerCase().replace(/[״"׳']/g, '').replace(/\s+/g, ' ').trim()
  const accounts: Account[] = state.accounts.filter((a) => state.filters.accountId === 'all' || a.id === state.filters.accountId)
  const real = state.trades.filter((t) => !t.demo)
  const pool = (real.length ? real : state.trades).filter((t) => accounts.some((a) => a.id === t.accountId))
  const start = sum(accounts.map((a) => a.startBalance || 0))
  const S = STARTERS[he ? 'he' : 'en']
  const has = (re: RegExp) => re.test(q)

  // greetings / help
  if (!q || has(/^(hi|hey|hello|help|שלום|היי|הי|עזרה|מה אתה יודע|מה אפשר|what can you)/)) return {
    rtl: he, title: L('היי, אני העוזר של היומן', "Hi, I'm your journal assistant"),
    text: L('אני מכיר את כל העסקאות, העמלות וכללי החשבון שלך. אפשר לשאול אותי על רווחים לפי תקופה, סטטיסטיקות, שעות וימים, לבקש חישובי פוזיציה וסיכון, לבדוק "מה אם", או לבקש הצעות לשיפור.',
      'I know all your trades, fees and account rules. Ask me about P&L for any period, stats, hours and weekdays, position size and risk maths, "what if" checks, or suggestions to improve.'),
    chips: S.slice(0, 6) }

  // plain arithmetic
  const pctOf = q.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of|מ-?|מתוך)\s*\$?(\d+(?:\.\d+)?)/)
  if (pctOf) { const v = (+pctOf[1] / 100) * +pctOf[2]; return { rtl: he, title: `${pctOf[1]}% × ${pctOf[2]} = ${num(v, 2).replace(/\.00$/, '')}` } }
  const expr = q.replace(/^(calc(ulate)?|חשב|תחשב|כמה זה|כמה יוצא|what is|whats)\s*/, '').replace(/[=?]$/, '').replace(/[x×]/g, '*').replace(/÷/g, '/')
  if (/^[\d\s.+\-*/()^]+$/.test(expr) && /\d\s*[+\-*/^]\s*[\d(]/.test(expr)) {
    try { const v = Function(`"use strict";return (${expr.replace(/\^/g, '**')})`)(); if (isFinite(v)) return { rtl: false, title: `${expr.trim()} = ${+(+v).toFixed(6)}` } } catch {}
  }

  const sym = symbolIn(q, pool)
  const mult = guessMultiplier(sym)

  // risk : reward from entry / stop / target
  const entry = numAfter(q, 'entry|כניסה|נכנס'), stopPx = numAfter(q, 'stop|סטופ|sl'), target = numAfter(q, 'target|tp|יעד|טייק')
  if (entry && stopPx && target && entry > 100) {
    const risk = Math.abs(entry - stopPx), reward = Math.abs(target - entry), rr = reward / (risk || 1)
    const qty = numBefore(q, 'contracts?|חוזים|חוזה') || 1
    return { rtl: he, title: L(`יחס סיכון/סיכוי 1:${num(rr)}`, `Risk : reward 1:${num(rr)}`), rows: [
      [L('סיכון', 'Risk'), `${num(risk)} pts · ${M(risk * mult * qty)}`, 'neg'],
      [L('רווח אפשרי', 'Reward'), `${num(reward)} pts · ${M(reward * mult * qty)}`, 'pos'],
      [L('אחוז הצלחה לאיזון', 'Break-even win rate'), pct(100 / (1 + rr))],
      [L('החוזה', 'Contract'), `${sym} · ${qty} × ${M(mult, 0)}/pt`]],
      text: L('הסכומים לפני עמלות.', 'Amounts are before fees.'), chips: [L('כמה חוזים לסיכון 200$ עם סטופ 20 נקודות?', 'How many contracts to risk $200 with a 20 point stop?')] }
  }

  // position size
  if (has(/contracts|position size|how many|כמה חוזים|גודל פוזיציה|גודל עסקה/) && has(/stop|סטופ|risk|סיכון|לסכן|points|נקודות|ticks|טיקים/)) {
    let risk = numAfter(q, 'risk|סיכון|לסכן|מסכן') ?? numBefore(q, '\\$|דולר|dollars?|usd')
    let stop = numAfter(q, 'stop|סטופ|sl')
    const ticks = has(/ticks?|טיקים|טיק/)
    if (stop == null) stop = numBefore(q, 'points?|pts|נקודות|ticks?|טיקים')
    if (risk == null) { const dl = accounts.map((a) => a.maxDailyLoss || 0).filter(Boolean); if (dl.length) risk = Math.min(...dl) * 0.25 }
    if (risk == null || !stop) return { rtl: he, text: L('כדי לחשב גודל פוזיציה אני צריך סכום סיכון וגודל סטופ. לדוגמה: "כמה חוזים MNQ לסיכון 200$ עם סטופ 20 נקודות?"', 'To size a position I need the risk amount and the stop size. For example: "How many MNQ contracts to risk $200 with a 20 point stop?"'), chips: [S[3]] }
    const pts = ticks ? stop * (TICK[sym] ?? 0.25) : stop
    const perC = pts * mult
    const n = Math.floor(risk / perC + 1e-9)
    const fee = (state.settings.feeRates || {})[sym] ?? (state.settings.feeRates || {})['*'] ?? 0
    return { rtl: he, title: n > 0 ? L(`${n} חוזי ${sym}`, `${n} ${sym} contract${n === 1 ? '' : 's'}`) : L(`הסטופ גדול מדי לסיכון הזה`, 'That stop is too wide for this risk'), rows: [
      [L('סיכון לחוזה', 'Risk per contract'), `${M(perC)}${ticks ? ` (${stop} ticks)` : ` (${num(pts)} pts)`}`],
      [L('סיכון כולל', 'Total risk'), M(n * perC), 'neg'],
      [L('עמלות הלוך-חזור', 'Round-trip fees'), M(n * fee * 2)],
      [L('שווי נקודה', 'Point value'), `${M(mult, 2)} × ${n}`]],
      text: n > 0 && risk - n * perC > 0.01 ? L(`נשארים ${M(risk - n * perC)} מתחת לסיכון שקבעת.`, `${M(risk - n * perC)} below your risk budget.`) : undefined,
      chips: [L('מה יחס הסיכון אם כניסה 21000 סטופ 20980 יעד 21060?', 'Risk reward for entry 21000 stop 20980 target 21060?'), L('כמה מקום נשאר לי בדרואודאון?', 'How much drawdown room do I have?')] }
  }

  // value of points / ticks
  if (has(/points?|pts|נקודות|ticks?|טיקים/) && has(/worth|value|שווה|שווים|כמה כסף|כמה זה|how much is|\$/) && !has(/stop|סטופ/)) {
    const pts0 = numBefore(q, 'points?|pts|נקודות|ticks?|טיקים') ?? 1
    const ticks = has(/ticks?|טיקים/)
    const qty = numBefore(q, 'contracts?|חוזים|חוזה') || 1
    const pts = ticks ? pts0 * (TICK[sym] ?? 0.25) : pts0
    return { rtl: he, title: `${pts0} ${ticks ? 'ticks' : 'pts'} ${sym} × ${qty} = ${M(pts * mult * qty)}`, text: L(`נקודה ב-${sym} שווה ${M(mult)} לחוזה.`, `One point of ${sym} is ${M(mult)} per contract.`) }
  }

  // nothing below works without trades
  if (!pool.length) return { rtl: he, text: L('עדיין אין עסקאות ביומן. ייבא קובץ מהברוקר ואוכל לענות על הכול.', 'There are no trades in the journal yet. Import a file from your broker and I can answer everything.') }

  const period = findPeriod(q)
  const wd = weekdayAsked(q)
  let trades = period ? pool.filter((t) => { const k = dayKey(t.exitTime); return k >= period.from && k <= period.to }) : pool
  if (wd != null && !has(/באיזה יום|which day|best day|worst day|weekday|day of week/)) trades = trades.filter((t) => new Date(t.exitTime).getDay() === wd)
  const when = period ? L(period.he, period.en) : wd != null ? L(`בימי ${HE_DAYS[wd]}`, `on ${WEEKDAYS[wd]}s`) : L('בסך הכול', 'overall')
  const s: Stats = computeStats(trades, start)

  // account rules: drawdown, daily loss, target
  const rulesQ = has(/drawdown|דרואודאון|דראודאון|דרו דאון|floor|רצפה|trailing|טריילינג|room|מקום/)
  const dailyQ = has(/daily loss|הפסד יומי|מגבלה יומית|left today|נשאר (לי )?היום|כמה (עוד )?(אפשר|מותר) להפסיד/)
  const targetQ = has(/profit target|target|יעד|להגיע ל/) && !entry
  if (rulesQ || dailyQ || targetQ) {
    const rows: Reply['rows'] = []
    for (const a of accounts) {
      const at = pool.filter((t) => t.accountId === a.id)
      const as = computeStats(at, a.startBalance)
      const name = accounts.length > 1 ? `${a.name} · ` : ''
      if (rulesQ && a.maxDrawdown) {
        rows.push([name + L('שיא החשבון', 'Peak balance'), M(as.peakBalance, 0)], [name + L('מתחת לשיא', 'Below peak'), M(as.currentDrawdown, 0), as.currentDrawdown ? 'warn' : 'pos'],
          [name + L('רצפת החשבון', 'Account floor'), M(as.peakBalance - a.maxDrawdown, 0)], [name + L('מקום שנשאר', 'Room left'), M(a.maxDrawdown - as.currentDrawdown, 0), 'pos'])
      }
      if (dailyQ && a.maxDailyLoss) {
        const td = dailyStats(at).find((d) => d.date === dayKeyOf(new Date()))?.net ?? 0
        rows.push([name + L('היום', 'Today'), M(td), tone(td)], [name + L('אפשר עוד להפסיד היום', 'Can still lose today'), M(a.maxDailyLoss - Math.max(0, -td), 0), 'warn'])
      }
      if (targetQ && a.profitTarget) {
        const left = Math.max(0, a.profitTarget - as.net)
        const pd = as.tradingDays ? as.net / as.tradingDays : 0
        rows.push([name + L('יעד רווח', 'Profit target'), M(a.profitTarget, 0)], [name + L('נשאר', 'To go'), M(left, 0), left ? 'info' : 'pos'])
        if (left && pd > 0) rows.push([name + L('בקצב הנוכחי', 'At your current pace'), L(`~${Math.ceil(left / pd)} ימי מסחר`, `~${Math.ceil(left / pd)} trading days`)])
      }
    }
    if (rows.length) return { rtl: he, title: L('מצב כללי החשבון', 'Account rules'), rows,
      text: rulesQ ? L('הדרואודאון נגרר מהשיא: הרצפה עולה כשהחשבון עושה שיא חדש.', 'The drawdown trails the peak: the floor moves up when the account makes a new high.') : undefined,
      chips: [L('איך אני מול כללי החשבון?', 'How am I doing against my account rules?'), L('כמה חוזים לסיכון 150$ עם סטופ 15 נקודות?', 'How many contracts to risk $150 with a 15 point stop?')] }
    if (!targetQ) return { rtl: he, text: L('לא הוגדרו כללי חשבון. אפשר להגדיר ב-Settings הפסד יומי מרבי, דרואודאון ויעד רווח.', 'No account rules are set. You can add max daily loss, drawdown and a profit target in Settings.') }
  }

  // what if
  if (has(/what if|מה אם|מה היה קורה|אילו|לו הייתי|if i (had|stopped|only|skipped)/)) {
    const days = dailyStats(trades)
    const actual = s.net
    let alt = actual, label = ''
    const n = (q.match(/(\d+)/) || [])[1]
    if (has(/fees|commission|עמלות|עמלה/)) { alt = sum(trades.map((t) => t.pnl)); label = L('בלי עמלות', 'without fees') }
    else if (has(/loss|losses|הפסדים|הפסד/)) {
      const k = +(n || 2)
      alt = sum(days.map((d) => { let streak = 0, tot = 0; for (const t of [...d.trades].sort((a, b) => a.entryTime.localeCompare(b.entryTime))) { if (streak >= k) break; tot += net(t); streak = net(t) < 0 ? streak + 1 : 0 } return tot }))
      label = L(`עצירה אחרי ${k} הפסדים רצופים ביום`, `stopping after ${k} losses in a row each day`)
    } else if (has(/trades? (a|per) day|עסקאות ביום|עסקאות ליום|max \d+ trades|רק \d+ עסקאות|first \d+/)) {
      const k = +(n || 3)
      alt = sum(days.map((d) => sum([...d.trades].sort((a, b) => a.entryTime.localeCompare(b.entryTime)).slice(0, k).map(net))))
      label = L(`מקסימום ${k} עסקאות ביום`, `at most ${k} trades a day`)
    } else if (has(/only long|רק לונג|רק קניות/)) { alt = sum(trades.filter((t) => t.side === 'long').map(net)); label = L('רק לונג', 'only longs') }
    else if (has(/only short|רק שורט|רק מכירות/)) { alt = sum(trades.filter((t) => t.side === 'short').map(net)); label = L('רק שורט', 'only shorts') }
    else if (n && has(/hour|שעה|שעת|before|לפני|at|ב-?\d/)) {
      const h = +n
      alt = sum(trades.filter((t) => new Date(t.entryTime).getHours() !== h).map(net)); label = L(`בלי עסקאות בשעה ${pad(h)}:00`, `skipping trades at ${pad(h)}:00`)
    } else if (has(/stop at|daily stop|עצירה יומית|עוצר ב|stopped at|stop the day/) && n) {
      const lim = +n
      alt = sum(days.map((d) => { let tot = 0; for (const t of [...d.trades].sort((a, b) => a.entryTime.localeCompare(b.entryTime))) { if (tot <= -lim) break; tot += net(t) } return tot }))
      label = L(`עצירה יומית אחרי הפסד של ${M(lim, 0)}`, `a daily stop at -${money(lim, 0)}`)
    } else return { rtl: he, text: L('אני יכול לבדוק: עצירה אחרי X הפסדים, מקסימום X עסקאות ביום, בלי עמלות, בלי שעה מסוימת, רק לונג/שורט, או עצירה יומית בסכום.', 'I can check: stopping after X losses, at most X trades a day, no fees, skipping an hour, only longs/shorts, or a daily stop amount.'),
      chips: [L('מה אם הייתי עוצר אחרי 2 הפסדים?', 'What if I stopped after 2 losses?'), L('מה אם רק 3 עסקאות ביום?', 'What if I took only 3 trades a day?'), L('מה אם הייתי עוצר ב-300 הפסד ביום?', 'What if I had a daily stop at 300?')] }
    const diff = alt - actual
    return { rtl: he, title: L(`מה אם: ${label}`, `What if: ${label}`), rows: [
      [L('בפועל', 'Actual'), M(actual), tone(actual)], [L('בתרחיש', 'In this scenario'), M(alt), tone(alt)], [L('הפרש', 'Difference'), (diff > 0 ? '+' : '') + M(diff), tone(diff)]],
      text: label === L('בלי עמלות', 'without fees') ? L(`העמלות לקחו ${M(diff)} — ${s.gross ? ((diff / Math.abs(s.gross)) * 100).toFixed(0) : 0}% מהרווח הגולמי.`, `Fees took ${money(diff)} — ${s.gross ? ((diff / Math.abs(s.gross)) * 100).toFixed(0) : 0}% of gross P&L.`) : Math.abs(diff) < 0.01 ? L('אין הבדל — הכלל הזה לא היה משנה כלום בעסקאות שלך.', 'No difference — that rule would not have changed any of your trades.') : diff > 0 ? L('הכלל הזה היה משפר את התוצאה. שווה לשקול להפוך אותו לחוק קבוע.', 'That rule would have improved the result. Worth considering as a fixed rule.') : L('הכלל הזה היה פוגע בתוצאה — העסקאות שהוא היה חוסך היו דווקא רווחיות.', 'That rule would have hurt — the trades it would cut were actually profitable.'),
      chips: [L('מה אם רק 3 עסקאות ביום?', 'What if I took only 3 trades a day?'), L('מה אם בלי עמלות?', 'What if there were no fees?')] }
  }

  // coach topics
  const coachChips = [L('מה הכי עולה לי כסף?', 'What is costing me the most?'), L('סכם לי את היום האחרון', 'Review my last day'), L('תן לי הצעות לשיפור', 'Give me suggestions')]
  const topic: Topic | null = has(/costing|leak|דליפה|עולה לי|הכי מפסיד|מה מפסיד לי|biggest problem|הבעיה/) ? 'leak'
    : has(/suggest|advice|tips|improve|next session|הצעות|הצעה|טיפ|לשפר|שיפור|מה לעשות|המלצ/) ? 'next'
    : has(/rules|כללים|כללי/) ? 'rules'
    : has(/review|summar|סכם|סיכום|יום האחרון|last (trading )?day/) && !period ? 'day' : null
  if (topic) { const r = coach(topic, pool, accounts, he ? 'he' : 'en'); if (r) return fromReport(r, he, coachChips) }

  if (!trades.length) return { rtl: he, text: L(`אין עסקאות ${when}.`, `No trades ${when}.`), chips: [L('כמה הרווחתי החודש?', 'How much did I make this month?'), L('כמה הרווחתי בסך הכול?', 'How much did I make overall?')] }

  // breakdowns
  const table = (gs: ReturnType<typeof groupBy>, title: string, pick: string): Reply => {
    const best = gs.reduce((a, b) => (b.net > a.net ? b : a)), worst = gs.reduce((a, b) => (b.net < a.net ? b : a))
    return { rtl: he, title, rows: gs.map((g) => [`${g.label} · ${g.count} ${L('עסק׳', 'trades')} · ${g.winRate.toFixed(0)}%`, M(g.net), tone(g.net)] as [string, string, Tone]),
      text: gs.length > 1 ? L(`הכי טוב: ${best.label} (${M(best.net)}). הכי חלש: ${worst.label} (${M(worst.net)}).`, `Best: ${best.label} (${M(best.net)}). Weakest: ${worst.label} (${M(worst.net)}).`) + (trades.length < 20 ? L(' עדיין מעט נתונים — זה סימן ראשוני.', ' Still a small sample — treat it as an early signal.') : '') : undefined,
      chips: [pick, L('מה אם הייתי מדלג על השעה החלשה?', 'What if I skipped my weakest hour?').replace(/השעה החלשה|my weakest hour/, () => { const w = groupBy(trades, (t) => String(new Date(t.entryTime).getHours())).reduce((a, b) => (b.net < a.net ? b : a)); return he ? `שעה ${w.key}` : `hour ${w.key}` })] }
  }
  if (has(/hour|time of day|שעה|שעות|באיזו שעה|what time/)) return table(groupBy(trades, (t) => pad(new Date(t.entryTime).getHours()), (k) => `${k}:00`).sort((a, b) => a.key.localeCompare(b.key)), L(`רווח לפי שעת כניסה ${when}`, `P&L by entry hour ${when}`), L('באיזה יום בשבוע אני הכי טוב?', 'Which weekday is best?'))
  if (has(/weekday|day of (the )?week|which day|באיזה יום|ימים בשבוע|יום בשבוע|ימי השבוע/)) return table(groupBy(trades, (t) => String(new Date(t.exitTime).getDay()), (k) => (he ? HE_DAYS[+k] : WEEKDAYS[+k])).sort((a, b) => +a.key - +b.key), L(`רווח לפי יום בשבוע ${when}`, `P&L by weekday ${when}`), L('באיזו שעה אני הכי טוב?', 'What is my best hour?'))
  if (has(/symbol|instrument|ticker|סימבול|נכס|מכשיר|חוזה הכי/)) return table(groupBy(trades, (t) => rootSymbol(t.symbol)).sort((a, b) => b.net - a.net), L(`רווח לפי סימבול ${when}`, `P&L by symbol ${when}`), L('לונג או שורט — מה עובד לי?', 'Long or short — which works for me?'))
  if (has(/long|short|לונג|שורט|קניה|מכירה|side|כיוון/)) return table(groupBy(trades, (t) => t.side, (k) => (k === 'long' ? L('לונג', 'Long') : L('שורט', 'Short'))), L(`לונג מול שורט ${when}`, `Long vs short ${when}`), L('באיזו שעה אני הכי טוב?', 'What is my best hour?'))

  // best / worst
  const isBest = has(/best|biggest win|largest win|הכי טובה?|הטובה? ביותר|הכי רווחי|הרווח הגדול|הכי גבוה/)
  const isWorst = has(/worst|biggest loss|largest loss|הכי גרועה?|הגרועה? ביותר|ההפסד הגדול|הכי מפסיד|הכי נמוך/)
  if (isBest || isWorst) {
    if (has(/trade|עסקה/)) {
      const t = trades.reduce((a, b) => (isBest ? (net(b) > net(a) ? b : a) : net(b) < net(a) ? b : a))
      return { rtl: he, title: L(`העסקה ${isBest ? 'הטובה' : 'הגרועה'} ביותר ${when}: ${M(net(t))}`, `${isBest ? 'Best' : 'Worst'} trade ${when}: ${money(net(t))}`), rows: [
        [L('תאריך', 'Date'), `${dateLong(dayKey(t.entryTime))} · ${timeOnly(t.entryTime)}`], [L('סימבול', 'Symbol'), `${t.symbol} · ${t.side === 'long' ? L('לונג', 'Long') : L('שורט', 'Short')} × ${t.qty}`],
        [L('כניסה → יציאה', 'Entry → exit'), `${t.entryPrice} → ${t.exitPrice}`], [L('עמלות', 'Fees'), M(t.fees)]], chips: [isBest ? L('מה העסקה הגרועה ביותר?', 'What was my worst trade?') : L('מה העסקה הטובה ביותר?', 'What was my best trade?'), L('באיזו שעה אני הכי טוב?', 'What is my best hour?')] }
    }
    const d = isBest ? s.bestDay : s.worstDay
    if (d) return { rtl: he, title: L(`היום ${isBest ? 'הטוב' : 'הגרוע'} ביותר ${when}: ${M(d.net)}`, `${isBest ? 'Best' : 'Worst'} day ${when}: ${money(d.net)}`), rows: [
      [L('תאריך', 'Date'), dateLong(d.date)], [L('עסקאות', 'Trades'), `${d.count} · ${d.wins}W / ${d.losses}L`], [L('עמלות', 'Fees'), M(sum(d.trades.map((t) => t.fees)))]],
      chips: [isBest ? L('מה היום הגרוע ביותר?', 'What was my worst day?') : L('מה היום הטוב ביותר?', 'What was my best day?'), L('סכם לי את היום האחרון', 'Review my last day')] }
  }

  // streaks
  if (has(/streak|רצף|ברצף/)) return { rtl: he, title: L(`רצפים ${when}`, `Streaks ${when}`), rows: [
    [L('רצף נוכחי', 'Current streak'), s.currentStreak > 0 ? L(`${s.currentStreak} רווחים`, `${s.currentStreak} wins`) : s.currentStreak < 0 ? L(`${-s.currentStreak} הפסדים`, `${-s.currentStreak} losses`) : '—', tone(s.currentStreak)],
    [L('רצף רווחים מרבי', 'Longest winning streak'), String(s.maxConsecWins), 'pos'], [L('רצף הפסדים מרבי', 'Longest losing streak'), String(s.maxConsecLosses), 'neg']] }

  // single metrics
  const metric: [RegExp, string, string, string, Tone?][] = [
    [/win ?rate|win %|אחוז ה?הצלחה|אחוז ה?זכיה|אחוזי ה?הצלחה|כמה אחוז/, L('אחוז הצלחה', 'Win rate'), pct(s.winRate), `${s.wins}W / ${s.losses}L`],
    [/profit factor|פרופיט פקטור|מקדם רווח/, 'Profit factor', num(s.profitFactor), L(`רווח ברוטו ${M(s.grossProfit, 0)} מול הפסד ${M(s.grossLoss, 0)}`, `${money(s.grossProfit, 0)} won vs ${money(s.grossLoss, 0)} lost`)],
    [/expectancy|תוחלת|ממוצע לעסקה|per trade/, L('תוחלת לעסקה', 'Expectancy per trade'), M(s.expectancy), '', tone(s.expectancy)],
    [/avg|average|ממוצע/, L('רווח / הפסד ממוצע', 'Avg win / loss'), `${M(s.avgWin, 0)} / ${M(-s.avgLoss, 0)}`, L(`יחס ${num(s.payoff)}`, `ratio ${num(s.payoff)}`)],
    [/fee|commission|עמלה|עמלות/, L('עמלות', 'Fees'), M(s.fees), L(`${s.gross ? ((s.fees / Math.abs(s.gross)) * 100).toFixed(0) : 0}% מהרווח הגולמי`, `${s.gross ? ((s.fees / Math.abs(s.gross)) * 100).toFixed(0) : 0}% of gross P&L`), 'neg'],
    [/how many trades|number of trades|כמה עסקאות|מספר עסקאות|trade count/, L('עסקאות', 'Trades'), String(s.count), L(`${s.tradingDays} ימי מסחר · ${num(s.avgTradesPerDay, 1)} ביום`, `${s.tradingDays} trading days · ${num(s.avgTradesPerDay, 1)} a day`)],
    [/balance|יתרה|כמה יש (לי )?בחשבון|equity|הון/, L('יתרה', 'Balance'), M(start + computeStats(pool, start).net), ''],
    [/hold|זמן החזקה|כמה זמן/, L('זמן החזקה ממוצע', 'Average hold'), `${Math.round(s.avgHold)}m`, L(`רווחים ${Math.round(s.avgHoldWin)}m · הפסדים ${Math.round(s.avgHoldLoss)}m`, `winners ${Math.round(s.avgHoldWin)}m · losers ${Math.round(s.avgHoldLoss)}m`)],
  ]
  const hits = metric.filter(([re]) => re.test(q))
  if (hits.length) return { rtl: he, title: hits.length === 1 ? `${hits[0][1]} ${when}: ${hits[0][2]}` : L(`הנתונים ${when}`, `Your numbers ${when}`),
    rows: hits.length === 1 ? (hits[0][3] ? [[L('פירוט', 'Detail'), hits[0][3]]] : undefined) : hits.map(([, l, v, , t]) => [l, v, t]),
    chips: [L('תן לי את כל הנתונים', 'Show me all my stats'), L('מה אם בלי עמלות?', 'What if there were no fees?'), L('באיזו שעה אני הכי טוב?', 'What is my best hour?')] }

  // P&L for a period / overview
  if (period || wd != null || has(/how much|pnl|p&l|profit|made|make|lost|stats|overview|summary|כמה הרווחתי|כמה הפסדתי|רווח|הפסד|נתונים|סטטיסטיק|מצב|איך אני|how am i|how did i/)) {
    return { rtl: he, title: L(`${when}: ${M(s.net)} נטו`, `${when[0].toUpperCase() + when.slice(1)}: ${money(s.net)} net`), rows: [
      [L('עסקאות', 'Trades'), `${s.count} · ${s.wins}W / ${s.losses}L`], [L('אחוז הצלחה', 'Win rate'), pct(s.winRate)], ['Profit factor', num(s.profitFactor)],
      [L('רווח גולמי', 'Gross P&L'), M(s.gross), tone(s.gross)], [L('עמלות', 'Fees'), M(-s.fees), 'neg'],
      ...(s.tradingDays > 1 && s.bestDay && s.worstDay ? [[L('היום הטוב', 'Best day'), `${shortDate(s.bestDay.date)} · ${M(s.bestDay.net, 0)}`, 'pos'], [L('היום החלש', 'Worst day'), `${shortDate(s.worstDay.date)} · ${M(s.worstDay.net, 0)}`, 'neg']] as [string, string, Tone][] : [])],
      chips: [L('באיזו שעה אני הכי טוב?', 'What is my best hour?'), L('מה הכי עולה לי כסף?', 'What is costing me the most?'), period?.en === 'this week' ? L('כמה הרווחתי בשבוע שעבר?', 'How much did I make last week?') : L('כמה הרווחתי השבוע?', 'How much did I make this week?')] }
  }

  return { rtl: he, text: L('לא בטוח שהבנתי. אפשר לשאול למשל:', "I'm not sure I understood. You can ask, for example:"), chips: S }
}

