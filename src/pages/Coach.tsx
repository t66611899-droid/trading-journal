import React, { useEffect, useRef, useState } from 'react'
import { Card, Seg } from '../components/ui'
import { askCoach, CoachNotConfigured, type ChatMessage } from '../lib/coach'
import { useCloud } from '../lib/cloud'
import { useStore } from '../lib/store'
import { useNav } from '../nav'

const PROMPTS = {
  he: ['נתח את יום המסחר האחרון שלי', 'מה הטעות שהכי עולה לי כסף?', 'איך אני עומד מול כללי החשבון?', 'מה לשפר במסחר הבא?'],
  en: ['Review my last trading day', 'Which mistake costs me the most?', 'How am I doing against my account rules?', 'What should I improve next session?'],
}
// The conversation survives moving between screens (it is cleared on reload).
let saved: ChatMessage[] = []

export default function Coach() {
  const cloud = useCloud()
  const nav = useNav()
  const hasTrades = useStore((s) => s.trades.some((t) => !t.demo))
  const [lang, setLang] = useState<'he' | 'en'>('he')
  const [msgs, setMsgs] = useState<ChatMessage[]>(saved)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setup, setSetup] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { saved = msgs; end.current?.scrollIntoView({ block: 'end' }) }, [msgs, busy])

  const send = async (content: string) => {
    if (!content.trim() || busy) return
    const next: ChatMessage[] = [...msgs, { role: 'user', content: content.trim() }]
    setMsgs(next); setText(''); setBusy(true); setError(null)
    try {
      const reply = await askCoach(next, lang)
      setMsgs([...next, { role: 'assistant', content: reply }])
    } catch (e: any) {
      if (e instanceof CoachNotConfigured) setSetup(true)
      else setError(e?.message || String(e))
      setMsgs(msgs) // nothing was answered: put the question back in the box
      setText(content)
    }
    setBusy(false)
  }

  if (!cloud.key)
    return <Card><div className="empty"><h2 style={{ color: 'var(--text)' }}>Turn on sync to use the coach</h2><p>The coach recognises your journal through device sync.</p><button className="btn primary" onClick={() => nav.go('settings')}>Open Settings</button></div></Card>

  return (
    <>
      <div className="page-head">
        <div className="muted">An AI coach that reads your stats, trades, notes and mistakes and tells you what it sees. It coaches your process — it does not give buy or sell advice.</div>
        <Seg value={lang} onChange={setLang} options={[['he', 'עברית'], ['en', 'English']]} />
      </div>
      {setup && (
        <div className="banner">
          <span><b>One step left:</b> the coach needs an AI key. Create one at console.anthropic.com, then in Supabase open the <b>trading-journal</b> project → Edge Functions → Secrets and add it under the name <b>ANTHROPIC_API_KEY</b>.</span>
          <button className="btn sm ghost" onClick={() => setSetup(false)}>Dismiss</button>
        </div>
      )}
      {!hasTrades && <div className="banner">There are no real trades in the journal yet — the coach has nothing to analyse until you import some.</div>}
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 420 }}>
        {msgs.length === 0 && (
          <div className="col" style={{ gap: 10, margin: 'auto', alignItems: 'center', padding: '30px 0' }}>
            <h2>What would you like to look at?</h2>
            <div className="row wrap" style={{ justifyContent: 'center', maxWidth: 640 }}>
              {PROMPTS[lang].map((p) => <button key={p} className="btn" dir="auto" onClick={() => send(p)}>{p}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} dir="auto" style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '82%', whiteSpace: 'pre-wrap', lineHeight: 1.65,
            padding: '10px 14px', borderRadius: 12, background: m.role === 'user' ? 'var(--accent)' : 'var(--panel2)',
            color: m.role === 'user' ? '#fff' : 'var(--text)', border: m.role === 'user' ? 'none' : '1px solid var(--line)',
          }}>{m.content}</div>
        ))}
        {busy && <div className="muted">The coach is reading your journal…</div>}
        {error && <div className="banner err">{error}</div>}
        <div ref={end} />
        <form className="row" style={{ marginTop: 'auto' }} onSubmit={(e) => { e.preventDefault(); send(text) }}>
          <input className="input" dir="auto" value={text} onChange={(e) => setText(e.target.value)} placeholder={lang === 'he' ? 'שאל את המאמן…' : 'Ask the coach…'} />
          <button className="btn primary" disabled={busy || !text.trim()}>Send</button>
          {msgs.length > 0 && <button type="button" className="btn ghost" onClick={() => { setMsgs([]); setError(null) }}>New chat</button>}
        </form>
      </Card>
    </>
  )
}
