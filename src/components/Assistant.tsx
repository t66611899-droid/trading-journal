import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Icon } from './ui'
import { ask, STARTERS, type Reply } from '../lib/assistant'
import { getState } from '../lib/store'
import { cls } from '../lib/format'

type Msg = Partial<Reply> & { me: boolean; text?: string }

// One conversation shared by the floating chat and the Coach page.
let log: Msg[] = []
const subs = new Set<() => void>()
const setLog = (l: Msg[]) => { log = l; subs.forEach((f) => f()) }
const useLog = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => log)
export const sendToAssistant = (text: string) => {
  const t = text.trim()
  if (!t) return
  let r: Reply
  try { r = ask(t, getState()) } catch { r = { rtl: /[֐-׿]/.test(t), text: 'Something went wrong with that question — try wording it differently.' } }
  setLog([...log, { me: true, text: t }, { ...r, me: false }])
}

function Bubble({ m, onChip }: { m: Msg; onChip: (s: string) => void }) {
  if (m.me) return <div className="msg me" dir="auto">{m.text}</div>
  return (
    <div className="col" style={{ gap: 8, alignItems: 'flex-start', width: '100%' }} dir={m.rtl ? 'rtl' : 'ltr'}>
      <div className="msg bot">
        {m.title && <div className="ttl">{m.title}</div>}
        {m.bullets && <div className="col" style={{ gap: 6, marginTop: 4 }}>{m.bullets.map((b, i) => <div key={i}>{b.startsWith('→') ? <b>{b}</b> : `• ${b}`}</div>)}</div>}
        {m.rows && (
          <table className="mt"><tbody>{m.rows.map(([k, v, t], i) => <tr key={i}><td className="muted">{k}</td><td className={t === 'pos' ? 'pos' : t === 'neg' ? 'neg' : ''}><bdi>{v}</bdi></td></tr>)}</tbody></table>
        )}
        {m.text && <div className={cls(!!(m.title || m.rows || m.bullets) && 'muted')} style={{ marginTop: m.title || m.rows ? 8 : 0, fontSize: m.title ? 12.5 : undefined }}>{m.text}</div>}
      </div>
      {m.chips && <div className="chips">{m.chips.map((c) => <button key={c} onClick={() => onChip(c)}>{c}</button>)}</div>}
    </div>
  )
}

export function ChatView({ onClose, autoFocus }: { onClose?: () => void; autoFocus?: boolean }) {
  const msgs = useLog()
  const [text, setText] = useState('')
  const [lang, setLang] = useState<'he' | 'en'>('he')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs.length])
  const send = (t: string) => { sendToAssistant(t); setText('') }
  return (
    <>
      <div className="chat-head">
        <div className="chat-avatar"><Icon name="spark" size={18} /></div>
        <div className="grow"><b>Journal Assistant</b><div className="faint" style={{ fontSize: 12 }}>Stats · calculations · what-ifs</div></div>
        {msgs.length > 0 && <button className="btn ghost sm" onClick={() => setLog([])}>Clear</button>}
        {onClose && <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon name="x" /></button>}
      </div>
      <div className="chat-log">
        {!msgs.length && (
          <div className="col" style={{ gap: 14, margin: 'auto 0' }}>
            <div style={{ textAlign: 'center' }} dir={lang === 'he' ? 'rtl' : 'ltr'}>
              <div className="chat-avatar" style={{ width: 52, height: 52, borderRadius: 16, margin: '0 auto 10px' }}><Icon name="spark" size={24} /></div>
              <h2>{lang === 'he' ? 'מה תרצה לדעת?' : 'What would you like to know?'}</h2>
              <div className="muted" style={{ marginTop: 4 }} dir={lang === 'he' ? 'rtl' : 'ltr'}>{lang === 'he' ? 'שאל על הרווחים, הסטטיסטיקות, הסיכון או בקש חישוב.' : 'Ask about your P&L, stats or risk, or ask for a calculation.'}</div>
              <div className="seg" style={{ marginTop: 12 }}><button className={cls(lang === 'he' && 'on')} onClick={() => setLang('he')}>עברית</button><button className={cls(lang === 'en' && 'on')} onClick={() => setLang('en')}>English</button></div>
            </div>
            <div className="chips" style={{ justifyContent: 'center' }} dir={lang === 'he' ? 'rtl' : 'ltr'}>{STARTERS[lang].map((c) => <button key={c} onClick={() => send(c)}>{c}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => <Bubble key={i} m={m} onChip={send} />)}
        <div ref={end} />
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(text) }}>
        <input className="input" dir="auto" autoFocus={autoFocus} value={text} onChange={(e) => setText(e.target.value)} placeholder={lang === 'he' ? 'שאל משהו… למשל "כמה הרווחתי החודש?"' : 'Ask anything… e.g. "How much did I make this month?"'} />
        <button className="btn primary" disabled={!text.trim()} aria-label="Send"><Icon name="send" size={16} /></button>
      </form>
    </>
  )
}

export function AssistantFab() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  return open
    ? <div className="chat-panel"><ChatView onClose={() => setOpen(false)} autoFocus /></div>
    : <button className="fab" onClick={() => setOpen(true)} aria-label="Ask the assistant"><Icon name="spark" size={20} /><span>Ask</span></button>
}
