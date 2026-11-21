import React, { useMemo, useState } from 'react'
import { Card, Seg } from '../components/ui'
import { coach, TOPICS, type Lang, type Topic } from '../lib/coach'
import { useStore } from '../lib/store'
import { cls } from '../lib/format'
import { useNav } from '../nav'

export default function Coach() {
  const trades = useStore((s) => s.trades)
  const accounts = useStore((s) => s.accounts)
  const nav = useNav()
  const [lang, setLang] = useState<Lang>('he')
  const [topic, setTopic] = useState<Topic>('day')
  const report = useMemo(() => coach(topic, trades, accounts, lang), [topic, trades, accounts, lang])
  const he = lang === 'he'
  return (
    <>
      <div className="page-head">
        <div className="muted">Your built-in coach: it reads your trades, fees, notes and account rules and tells you what it sees. Free, private, and it runs on your device.</div>
        <Seg value={lang} onChange={setLang} options={[['he', 'עברית'], ['en', 'English']]} />
      </div>
      <div className="row wrap" dir={he ? 'rtl' : 'ltr'}>
        {TOPICS.map((t) => <button key={t.id} className={cls('btn', topic === t.id && 'primary')} onClick={() => setTopic(t.id)}>{he ? t.he : t.en}</button>)}
      </div>
      {!report ? (
        <Card><div className="empty"><h2 style={{ color: 'var(--text)' }}>Nothing to analyse yet</h2><p>Import your trades and the coach will have something to say.</p><button className="btn primary" onClick={() => nav.go('import')}>Import trades</button></div></Card>
      ) : (
        <Card>
          <div dir={he ? 'rtl' : 'ltr'} className="col" style={{ gap: 14, fontSize: 14.5, lineHeight: 1.7 }}>
            <h2 style={{ fontSize: 19 }}>{report.headline}</h2>
            {report.points.map((p, i) => (
              <div key={i} className="insight"><span className="dot" style={{ background: p.tone === 'info' ? 'var(--accent)' : `var(--${p.tone})`, marginTop: 9 }} /><span>{p.text}</span></div>
            ))}
            {report.actions.length > 0 && (
              <div>
                <div className="section-title" style={{ margin: '4px 0 8px' }}>{he ? 'מה לעשות' : 'What to do'}</div>
                <ol style={{ margin: 0, paddingInlineStart: 22 }}>{report.actions.map((a) => <li key={a} style={{ marginBottom: 4 }}><b>{a}</b></li>)}</ol>
              </div>
            )}
            {report.note && <div className="faint" style={{ fontSize: 13 }}>{report.note}</div>}
          </div>
        </Card>
      )}
      <div className="faint" style={{ fontSize: 12.5 }}>The coach looks at your process — discipline, risk and habits. It does not predict the market or tell you what to buy or sell.</div>
    </>
  )
}
