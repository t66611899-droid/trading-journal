import React, { useEffect, useState } from 'react'
import { cls, money, pnlClass } from '../lib/format'

const ICONS: Record<string, string> = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  calendar: 'M7 2v3M17 2v3M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  book: 'M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5v14zM4 19.5A2.5 2.5 0 006.5 22H20v-5',
  chart: 'M3 3v18h18M7 15l4-5 4 3 5-7',
  future: 'M3 17l6-6 4 4 8-9M15 6h6v6',
  target: 'M12 22a10 10 0 100-20 10 10 0 000 20zm0-4a6 6 0 100-12 6 6 0 000 12zm0-4a2 2 0 100-4 2 2 0 000 4z',
  upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 01-4 0v-.1A1.7 1.7 0 008 19.4a1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00-1.2-2.9H2a2 2 0 010-4h.1A1.7 1.7 0 003.6 8a1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H8a1.7 1.7 0 001-1.5V2a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V8a1.7 1.7 0 001.5 1H22a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z',
  globe: 'M12 22a10 10 0 100-20 10 10 0 000 20zM2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20',
  spark: 'M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z',
  plus: 'M12 5v14M5 12h14', x: 'M18 6L6 18M6 6l12 12', trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
  left: 'M15 18l-6-6 6-6', right: 'M9 18l6-6-6-6', link: 'M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1',
  image: 'M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM21 15l-5-5L5 21',
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
}
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
      <path d={ICONS[name]} />
    </svg>
  )
}

export function Card({ title, right, children, style, className }: { title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={cls('card', className)} style={style}>
      {(title || right) && <div className="card-title"><span>{title}</span>{right}</div>}
      {children}
    </div>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: number }) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className={cls('stat-value num', tone !== undefined && pnlClass(tone))}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export const Money = ({ v, digits = 2, plain }: { v: number; digits?: number; plain?: boolean }) => (
  <span className={cls('num', !plain && pnlClass(v))}>{money(v, digits)}</span>
)

export function Seg<T extends string = any>({ value, onChange, options }: { value: T; onChange: (v: any) => void; options: readonly (readonly [string, string])[] }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={v} className={cls(value === v && 'on')} onClick={() => onChange(v)} type="button">{l}</button>
      ))}
    </div>
  )
}

export function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="field" style={style}><label>{label}</label>{children}</div>
}

export function Modal({ title, onClose, children, footer, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cls('modal', wide && 'wide')}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

/** Free-text multi-value input with suggestions (tags, mistakes). */
export function TagInput({ value, onChange, suggestions, placeholder, tone }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[]; placeholder: string; tone?: 'neg' | 'accent' }) {
  const [text, setText] = useState('')
  const add = (s: string) => {
    const v = s.trim()
    if (v && !value.includes(v)) onChange([...value, v])
    setText('')
  }
  const rest = suggestions.filter((s) => !value.includes(s)).slice(0, 8)
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row wrap" style={{ gap: 6 }}>
        {value.map((v) => (
          <span key={v} className={cls('chip', tone)}>{v}<button type="button" onClick={() => onChange(value.filter((x) => x !== v))}>×</button></span>
        ))}
        <input className="input" style={{ flex: 1, minWidth: 130 }} value={text} placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(text) } }}
          onBlur={() => add(text)} />
      </div>
      {rest.length > 0 && (
        <div className="row wrap" style={{ gap: 5 }}>
          {rest.map((s) => <button type="button" key={s} className="chip" style={{ cursor: 'pointer' }} onClick={() => add(s)}>+ {s}</button>)}
        </div>
      )}
    </div>
  )
}

export function download(name: string, content: string, type = 'text/plain') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
