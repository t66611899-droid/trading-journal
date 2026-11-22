import React, { useMemo } from 'react'
import { Card } from '../components/ui'
import { ChatView, sendToAssistant } from '../components/Assistant'
import { coach } from '../lib/coach'
import { useStore } from '../lib/store'

const ASK: [string, string][] = [
  ['סיכום היום האחרון', 'סכם לי את היום האחרון'],
  ['מה הכי עולה לי כסף', 'מה הכי עולה לי כסף?'],
  ['הצעות לשיפור', 'תן לי הצעות לשיפור'],
  ['מצב כללי החשבון', 'איך אני מול כללי החשבון?'],
  ['רווח לפי שעה', 'באיזו שעה אני הכי טוב?'],
  ['רווח לפי יום בשבוע', 'באיזה יום בשבוע אני הכי טוב?'],
  ['מה אם 2 הפסדים = סוף יום', 'מה אם הייתי עוצר אחרי 2 הפסדים?'],
  ['גודל פוזיציה', 'כמה חוזים MNQ לסיכון 200$ עם סטופ 20 נקודות?'],
]

export default function Coach() {
  const trades = useStore((s) => s.trades)
  const accounts = useStore((s) => s.accounts)
  const leak = useMemo(() => coach('leak', trades, accounts, 'he'), [trades, accounts])
  const next = useMemo(() => coach('next', trades, accounts, 'he'), [trades, accounts])
  return (
    <div className="coach-page">
      <div className="card chat-box"><ChatView /></div>
      <div className="col" style={{ gap: 18 }}>
        {next && next.actions.length > 0 && (
          <Card title="Focus for next session">
            <ol dir="rtl" style={{ margin: 0, paddingInlineStart: 20, lineHeight: 1.7 }}>{next.actions.map((a) => <li key={a}>{a}</li>)}</ol>
          </Card>
        )}
        {leak && <Card title="Biggest leak"><div dir="rtl" style={{ lineHeight: 1.6 }}><b>{leak.headline}</b>{leak.points[0] && <div className="muted" style={{ marginTop: 6 }}>{leak.points[0].text}</div>}</div></Card>}
        <Card title="Quick questions">
          <div className="chips" dir="rtl">{ASK.map(([l, q]) => <button key={l} onClick={() => sendToAssistant(q)}>{l}</button>)}</div>
        </Card>
        <div className="faint" style={{ fontSize: 12 }}>Runs on your device from your own trades — free and private. It looks at process, risk and habits; it does not predict the market.</div>
      </div>
    </div>
  )
}
