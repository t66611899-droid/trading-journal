// Built-in coach: reads the journal and writes plain-language observations and next steps.
// Everything is computed in the browser from the trades themselves — no AI service, no cost.
import type { Account, Trade } from './types'
import { computeStats, dailyStats, groupBy, holdMin, net, outcome, type DayStat } from './stats'
import { dateLong as dateEn, dayKey, duration as durEn, money, timeOnly } from './format'

export type Lang = 'he' | 'en'
export type Tone = 'pos' | 'neg' | 'warn' | 'info'
export interface Report { headline: string; points: { tone: Tone; text: string }[]; actions: string[]; note?: string }

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)
// Isolated so amounts like -$609 keep their sign on the correct side inside Hebrew text.
const m0 = (n: number) => `\u2066${money(n, 0)}\u2069`
const SMALL = 20

// Dates and durations follow the report language.
let HE = true
const dateLong = (key: string) => (HE ? key.split('-').reverse().join('/') : dateEn(key))
const duration = (min: number) => (HE ? durEn(min).replace(/(\d)s/g, '$1 שניות').replace(/(\d)m/g, '$1 דק׳').replace(/(\d)h/g, '$1 שע׳').replace(/(\d)d/g, '$1 ימים') : durEn(min))
const tradesHe = (n: number) => (n === 1 ? 'עסקה אחת' : `${n} עסקאות`)

interface Ctx { trades: Trade[]; accounts: Account[]; L: (he: string, en: string) => string }
const byEntry = (a: Trade, b: Trade) => a.entryTime.localeCompare(b.entryTime)

/** Trades entered within `withinMin` minutes of closing a losing trade on the same day. */
function quickReentries(trades: Trade[], withinMin = 2): Trade[] {
  const s = [...trades].sort(byEntry)
  return s.filter((t, i) => {
    const prev = s[i - 1]
    if (!prev || dayKey(prev.entryTime) !== dayKey(t.entryTime) || net(prev) >= 0) return false
    return (new Date(t.entryTime).getTime() - new Date(prev.exitTime).getTime()) / 60000 <= withinMin
  })
}
/** Trades taken after two or more losses in a row on the same day. */
function afterTwoLosses(trades: Trade[]): Trade[] {
  const out: Trade[] = []
  let day = '', streak = 0
  for (const t of [...trades].sort(byEntry)) {
    const d = dayKey(t.entryTime)
    if (d !== day) { day = d; streak = 0 }
    if (streak >= 2) out.push(t)
    streak = net(t) < 0 ? streak + 1 : 0
  }
  return out
}
const dailyLimit = (c: Ctx) => { const v = c.accounts.map((a) => a.maxDailyLoss || 0).filter(Boolean); return v.length ? Math.min(...v) : 0 }

function sampleNote(c: Ctx): string | undefined {
  const n = c.trades.length
  return n < SMALL ? c.L(`יש ביומן רק ${n} עסקאות. מה שכתוב כאן הוא סימן ראשוני, לא מסקנה — הדפוסים יתבררו ככל שיצטברו עוד נתונים.`, `There are only ${n} trades in the journal. Treat this as an early signal, not a conclusion — patterns firm up as more data comes in.`) : undefined
}

function reviewDay(c: Ctx, d: DayStat): Report {
  const { L } = c
  const ts = [...d.trades].sort(byEntry)
  const points: Report['points'] = [], actions: string[] = []
  const limit = dailyLimit(c)
  const worst = ts.reduce((a, b) => (net(b) < net(a) ? b : a))
  const best = ts.reduce((a, b) => (net(b) > net(a) ? b : a))
  const fees = sum(ts.map((t) => t.fees))
  points.push({ tone: d.net >= 0 ? 'pos' : 'neg', text: L(
    `סיימת את היום ב-${m0(d.net)} נטו: ${d.count} עסקאות, ${d.wins} ברווח ו-${d.losses} בהפסד. העמלות לקחו ${m0(fees)}.`,
    `You finished the day at ${m0(d.net)} net: ${d.count} trades, ${d.wins} winners and ${d.losses} losers. Fees took ${m0(fees)}.`) })
  if (net(best) > 0) points.push({ tone: 'pos', text: L(
    `העסקה הטובה ביותר: ${m0(net(best))} ב-${timeOnly(best.entryTime)}, החזקה של ${duration(holdMin(best))}.`,
    `Best trade: ${m0(net(best))} at ${timeOnly(best.entryTime)}, held for ${duration(holdMin(best))}.`) })
  if (net(worst) < 0) points.push({ tone: 'neg', text: L(
    `ההפסד הגדול ביותר: ${m0(net(worst))} ב-${timeOnly(worst.entryTime)}, אחרי ${duration(holdMin(worst))} בלבד בעסקה.`,
    `Largest loss: ${m0(net(worst))} at ${timeOnly(worst.entryTime)}, after only ${duration(holdMin(worst))} in the trade.`) })

  const re = quickReentries(ts)
  if (re.length) {
    const rn = sum(re.map(net))
    points.push({ tone: 'warn', text: L(
      `${re.length === 1 ? 'נכנסת לעסקה חדשה' : `נכנסת ל-${re.length} עסקאות חדשות`} פחות משתי דקות אחרי סגירת הפסד (${re.map((t) => timeOnly(t.entryTime)).join(', ')}). התוצאה של הכניסות האלה: ${m0(rn)}. כניסה כל כך מהירה אחרי הפסד היא בדרך כלל תגובה רגשית ולא סטאפ חדש.`,
      `You opened ${re.length === 1 ? 'a new trade' : `${re.length} new trades`} less than two minutes after closing a loss (${re.map((t) => timeOnly(t.entryTime)).join(', ')}). Those entries made ${m0(rn)}. Re-entering that fast after a loss is usually an emotional reaction, not a new setup.`) })
    actions.push(L('אחרי כל הפסד: 5 דקות הפסקה מהמסך לפני העסקה הבאה.', 'After every loss: step away for 5 minutes before the next trade.'))
  }
  const a2 = afterTwoLosses(ts)
  if (a2.length) {
    points.push({ tone: sum(a2.map(net)) < 0 ? 'neg' : 'info', text: L(
      `המשכת לסחור אחרי שני הפסדים רצופים: ${tradesHe(a2.length)} נוספות, סה״כ ${m0(sum(a2.map(net)))}.`,
      `You kept trading after two losses in a row: ${a2.length} more trades, ${m0(sum(a2.map(net)))} in total.`) })
    actions.push(L('שני הפסדים רצופים = סוף יום המסחר.', 'Two losses in a row = done for the day.'))
  }
  if (limit && d.net < 0) {
    const used = (-d.net / limit) * 100
    if (used >= 100) {
      points.push({ tone: 'neg', text: L(
        `עברת את מגבלת ההפסד היומית: ${m0(-d.net)} מתוך ${m0(limit)} מותרים. בחשבון ממומן זה עלול לסגור את החשבון.`,
        `You went past the daily loss limit: ${m0(-d.net)} against ${m0(limit)} allowed. On a funded account that can end the account.`) })
      actions.push(L(`קבע לעצמך עצירה אישית ב-${m0(limit * 0.6)} — הרבה לפני המגבלה של ${m0(limit)}.`, `Set a personal stop at ${m0(limit * 0.6)} — well before the ${m0(limit)} limit.`))
    } else if (used >= 60) points.push({ tone: 'warn', text: L(
      `השתמשת ב-${used.toFixed(0)}% ממגבלת ההפסד היומית (${m0(-d.net)} מתוך ${m0(limit)}).`,
      `You used ${used.toFixed(0)}% of the daily loss limit (${m0(-d.net)} of ${m0(limit)}).`) })
  }
  const first = ts[0]
  if (ts.length > 1 && net(first) < 0 && worst.id === first.id) points.push({ tone: 'info', text: L(
    'ההפסד הגדול של היום היה העסקה הראשונה. שים לב אם יש לך נטייה להיכנס חזק מדי בפתיחה.',
    'The biggest loss of the day was your first trade. Watch for a tendency to come in too hard at the start.') })
  if (!actions.length) actions.push(d.net >= 0
    ? L('יום נקי. רשום ביומן היומי מה עבד, כדי שתוכל לחזור על זה.', 'A clean day. Write down in the daily journal what worked so you can repeat it.')
    : L('רשום ביומן היומי מה ראית לפני כל כניסה — זה יעזור לזהות מה חוזר על עצמו.', 'Write down in the daily journal what you saw before each entry — it helps spot what repeats.'))
  return { headline: L(`סיכום ${dateLong(d.date)}`, `Review of ${dateLong(d.date)}`), points, actions, note: sampleNote(c) }
}

function leaks(c: Ctx): { tone: Tone; cost: number; text: string; action: string }[] {
  const { L, trades } = c
  const out: { tone: Tone; cost: number; text: string; action: string }[] = []
  const add = (cost: number, text: string, action: string) => cost < 0 && out.push({ tone: 'neg', cost, text, action })
  const re = quickReentries(trades)
  if (re.length) add(sum(re.map(net)),
    L(`כניסה מהירה אחרי הפסד (פחות משתי דקות): ${tradesHe(re.length)}, סה״כ ${m0(sum(re.map(net)))}.`, `Fast re-entry after a loss (under two minutes): ${re.length} trades, ${m0(sum(re.map(net)))} in total.`),
    L('אחרי כל הפסד: 5 דקות הפסקה לפני העסקה הבאה.', 'After every loss: a 5-minute break before the next trade.'))
  const a2 = afterTwoLosses(trades)
  if (a2.length) add(sum(a2.map(net)),
    L(`מסחר אחרי שני הפסדים רצופים: ${tradesHe(a2.length)}, סה״כ ${m0(sum(a2.map(net)))}.`, `Trading after two losses in a row: ${a2.length} trades, ${m0(sum(a2.map(net)))} in total.`),
    L('שני הפסדים רצופים = סוף יום המסחר.', 'Two losses in a row = done for the day.'))
  for (const g of groupBy(trades, (t) => t.mistakes)) add(g.net,
    L(`הטעות "${g.label}": ${tradesHe(g.count)}, סה״כ ${m0(g.net)}.`, `The mistake "${g.label}": ${g.count} trades, ${m0(g.net)} in total.`),
    L(`לפני כל כניסה, שאל את עצמך אם זו שוב "${g.label}".`, `Before each entry, ask yourself whether this is "${g.label}" again.`))
  const hours = groupBy(trades, (t) => String(new Date(t.entryTime).getHours()), (k) => `${k.padStart(2, '0')}:00`).filter((g) => g.count >= 3)
  const daysAt = (hour: string) => new Set(trades.filter((t) => String(new Date(t.entryTime).getHours()) === hour).map((t) => dayKey(t.entryTime))).size
  if (hours.length >= 2 && daysAt(hours.reduce((a, b) => (b.net < a.net ? b : a)).key) >= 3) {
    const w = hours.reduce((a, b) => (b.net < a.net ? b : a))
    add(w.net,
      L(`השעה ${w.label} היא החלשה שלך: ${w.count} עסקאות, ${w.winRate.toFixed(0)}% הצלחה, סה״כ ${m0(w.net)}.`, `${w.label} is your weakest hour: ${w.count} trades, ${w.winRate.toFixed(0)}% win rate, ${m0(w.net)} in total.`),
      L(`בשבוע הקרוב: בלי עסקאות בשעה ${w.label}, או בחצי גודל.`, `For the coming week: no trades at ${w.label}, or half size.`))
  }
  const s = computeStats(trades)
  if (s.losses >= 2 && s.wins >= 2 && s.avgLoss > s.avgWin) add(-(s.avgLoss - s.avgWin) * s.losses,
    L(`ההפסד הממוצע (${m0(s.avgLoss)}) גדול מהרווח הממוצע (${m0(s.avgWin)}). כדי להרוויח כך צריך אחוז הצלחה גבוה מאוד.`, `Your average loss (${m0(s.avgLoss)}) is bigger than your average win (${m0(s.avgWin)}). Making money that way needs a very high win rate.`),
    L('הגדר סטופ לפני הכניסה, ואל תזיז אותו רחוק יותר.', 'Set the stop before entering, and never move it further away.'))
  return out.sort((a, b) => a.cost - b.cost)
}

function leakReport(c: Ctx): Report {
  const { L } = c
  const ls = leaks(c)
  if (!ls.length) return { headline: L('לא מצאתי דליפה ברורה', 'No clear leak found'), note: sampleNote(c), actions: [L('תייג טעויות בעסקאות (FOMO, הזזת סטופ וכו׳) — כך אוכל לחשב כמה כל אחת עולה לך.', 'Tag mistakes on your trades (FOMO, moved stop, etc.) so I can work out what each one costs you.')],
    points: [{ tone: 'pos', text: L('בנתונים שיש כרגע אין דפוס שחוזר ועולה לך כסף.', 'In the data so far there is no repeating pattern that is costing you money.') }] }
  return { headline: L(`הדליפה הגדולה ביותר עולה לך ${m0(-ls[0].cost)}`, `Your biggest leak is costing you ${m0(-ls[0].cost)}`), note: sampleNote(c),
    points: ls.slice(0, 4).map((l) => ({ tone: l.tone, text: l.text })), actions: [...new Set(ls.slice(0, 3).map((l) => l.action))] }
}

function rulesReport(c: Ctx): Report {
  const { L, trades } = c
  const points: Report['points'] = [], actions: string[] = []
  const withRules = c.accounts.filter((a) => a.maxDailyLoss || a.maxDrawdown || a.profitTarget)
  if (!withRules.length) return { headline: L('לא הוגדרו כללי חשבון', 'No account rules are set'), points: [{ tone: 'info', text: L('הגדר ב-Settings יעד רווח, הפסד יומי מרבי ודרואודאון מרבי, ואבדוק את העמידה שלך בהם.', 'Set a profit target, max daily loss and max drawdown in Settings and I will check how you are doing against them.') }], actions: [] }
  for (const a of withRules) {
    const at = trades.filter((t) => t.accountId === a.id)
    const s = computeStats(at, a.startBalance)
    const days = dailyStats(at)
    if (a.maxDailyLoss) {
      const over = days.filter((d) => -d.net >= a.maxDailyLoss!)
      const worst = days.length ? days.reduce((x, y) => (y.net < x.net ? y : x)) : null
      if (over.length) {
        points.push({ tone: 'neg', text: L(
          `${a.name}: ${over.length === 1 ? 'ביום אחד' : `ב-${over.length} ימים`} עברת את מגבלת ההפסד היומית של ${m0(a.maxDailyLoss)} (${over.map((d) => `${dateLong(d.date)}: ${m0(d.net)}`).join('; ')}).`,
          `${a.name}: on ${over.length} ${over.length === 1 ? 'day' : 'days'} you went past the ${m0(a.maxDailyLoss)} daily loss limit (${over.map((d) => `${dateLong(d.date)}: ${m0(d.net)}`).join('; ')}).`) })
        actions.push(L(`קבע עצירה אישית ב-${m0(a.maxDailyLoss * 0.6)} ליום, כדי שלא תתקרב למגבלה.`, `Set a personal daily stop at ${m0(a.maxDailyLoss * 0.6)} so you never get near the limit.`))
      } else if (worst && worst.net < 0) points.push({ tone: -worst.net / a.maxDailyLoss > 0.6 ? 'warn' : 'pos', text: L(
        `${a.name}: היום הקשה ביותר היה ${m0(worst.net)}, שהם ${((-worst.net / a.maxDailyLoss) * 100).toFixed(0)}% ממגבלת ההפסד היומית.`,
        `${a.name}: your hardest day was ${m0(worst.net)}, which is ${((-worst.net / a.maxDailyLoss) * 100).toFixed(0)}% of the daily loss limit.`) })
      else points.push({ tone: 'pos', text: L(`${a.name}: לא היה יום הפסדי אחד מול מגבלה של ${m0(a.maxDailyLoss)}.`, `${a.name}: not a single losing day against a ${m0(a.maxDailyLoss)} limit.`) })
    }
    if (a.maxDrawdown) {
      // Trailing rule: what matters is how far the balance is below its peak right now.
      const used = (s.currentDrawdown / a.maxDrawdown) * 100
      const floor = s.peakBalance - a.maxDrawdown
      points.push({ tone: used >= 100 ? 'neg' : used >= 60 ? 'warn' : 'pos', text: L(
        `${a.name}: אתה ${m0(s.currentDrawdown)} מתחת לשיא (${m0(s.peakBalance)}), מתוך ${m0(a.maxDrawdown)} מותרים. רצפת החשבון כרגע: ${m0(floor)}. הירידה הגדולה ביותר בדרך הייתה ${m0(s.maxDrawdown)}.`,
        `${a.name}: you are ${m0(s.currentDrawdown)} below your peak (${m0(s.peakBalance)}), of ${m0(a.maxDrawdown)} allowed. The account floor is now ${m0(floor)}. The deepest dip along the way was ${m0(s.maxDrawdown)}.`) })
      if (used >= 60) actions.push(L('הקטן את גודל הפוזיציה עד שתתרחק מרצפת החשבון.', 'Trade smaller size until you have room again above the account floor.'))
    }
    if (a.profitTarget) points.push({ tone: s.net >= a.profitTarget ? 'pos' : 'info', text: L(
      `${a.name}: ${m0(Math.max(0, s.net))} מתוך יעד רווח של ${m0(a.profitTarget)} (${Math.max(0, (s.net / a.profitTarget) * 100).toFixed(0)}%).`,
      `${a.name}: ${m0(Math.max(0, s.net))} of a ${m0(a.profitTarget)} profit target (${Math.max(0, (s.net / a.profitTarget) * 100).toFixed(0)}%).`) })
  }
  const bad = points.some((p) => p.tone === 'neg')
  return { headline: bad ? L('יש חריגה מכללי החשבון', 'An account rule was broken') : L('אתה בתוך כללי החשבון', 'You are inside your account rules'), points, actions, note: sampleNote(c) }
}

function nextSession(c: Ctx): Report {
  const { L, trades } = c
  const s = computeStats(trades)
  const points: Report['points'] = []
  const actions = [...new Set([...leaks(c).slice(0, 2).map((l) => l.action), ...rulesReport(c).actions])].slice(0, 3)
  const wins = trades.filter((t) => outcome(t) === 'win')
  if (wins.length >= 2 && s.avgWin > s.avgLoss) points.push({ tone: 'pos', text: L(
    `מה לשמר: הרווח הממוצע (${m0(s.avgWin)}) גדול מההפסד הממוצע (${m0(s.avgLoss)}). אתה נותן לרווחים לרוץ.`,
    `Keep doing this: your average win (${m0(s.avgWin)}) is bigger than your average loss (${m0(s.avgLoss)}). You let winners run.`) })
  if (s.avgHoldWin && s.avgHoldLoss) points.push({ tone: s.avgHoldLoss > s.avgHoldWin * 1.15 ? 'warn' : 'pos', text: s.avgHoldLoss > s.avgHoldWin * 1.15
    ? L(`אתה מחזיק הפסדים (${duration(s.avgHoldLoss)}) יותר זמן מרווחים (${duration(s.avgHoldWin)}).`, `You hold losers (${duration(s.avgHoldLoss)}) longer than winners (${duration(s.avgHoldWin)}).`)
    : L(`אתה חותך הפסדים מהר (${duration(s.avgHoldLoss)}) ונותן לרווחים זמן (${duration(s.avgHoldWin)}).`, `You cut losers fast (${duration(s.avgHoldLoss)}) and give winners time (${duration(s.avgHoldWin)}).`) })
  const untagged = trades.filter((t) => !t.setupId && !t.notes && !t.mistakes.length).length
  if (untagged > trades.length / 2) {
    points.push({ tone: 'info', text: L(`ב-${untagged} מתוך ${trades.length} עסקאות אין סטאפ, הערה או תיוג טעות. בלי זה קשה לדעת למה עסקה עבדה או נכשלה.`, `${untagged} of ${trades.length} trades have no playbook, note or mistake tag. Without them it is hard to know why a trade worked or failed.`) })
    if (actions.length < 3) actions.push(L('בסוף כל יום: שורה אחת על כל עסקה — למה נכנסת ומה קרה.', 'At the end of each day: one line per trade — why you entered and what happened.'))
  }
  if (!actions.length) actions.push(L('המשך באותה משמעת, ותעד כל עסקה.', 'Keep the same discipline and log every trade.'))
  return { headline: L('התוכנית למסחר הבא', 'Plan for the next session'), points, actions, note: sampleNote(c) }
}

export type Topic = 'day' | 'leak' | 'rules' | 'next'
export const TOPICS: { id: Topic; he: string; en: string }[] = [
  { id: 'day', he: 'סיכום יום המסחר האחרון', en: 'Review my last trading day' },
  { id: 'leak', he: 'מה הכי עולה לי כסף?', en: 'What is costing me the most?' },
  { id: 'rules', he: 'איך אני מול כללי החשבון?', en: 'How am I doing against my account rules?' },
  { id: 'next', he: 'מה לשפר במסחר הבא?', en: 'What should I improve next session?' },
]

export function coach(topic: Topic, allTrades: Trade[], accounts: Account[], lang: Lang): Report | null {
  const trades = allTrades.filter((t) => !t.demo)
  if (!trades.length) return null
  HE = lang === 'he'
  const c: Ctx = { trades, accounts, L: (he, en) => (lang === 'he' ? he : en) }
  if (topic === 'day') { const days = dailyStats(trades); return reviewDay(c, days[days.length - 1]) }
  return topic === 'leak' ? leakReport(c) : topic === 'rules' ? rulesReport(c) : nextSession(c)
}
