import React, { useEffect, useMemo, useState } from 'react'
import { Field, Icon, Modal, Money, Seg, TagInput } from '../components/ui'
import { TvChart } from '../components/charts'
import { deleteTrades, getState, removeImage, saveImage, upsertTrade, useImage, useStore } from '../lib/store'
import type { Execution, Trade } from '../lib/types'
import { cls, dateTime, duration, fromLocalInput, num, px, toLocalInput, uid } from '../lib/format'
import { guessMultiplier, isFuture, tvEmbedSymbol, tvSnapshotImage, tvSymbol } from '../lib/instruments'
import { holdMin, net, rMultiple } from '../lib/stats'

const EMOTIONS = ['Calm', 'Confident', 'Hesitant', 'Stressed', 'Impatient', 'Greedy', 'Fearful', 'Revengeful']
const BASE_MISTAKES = ['FOMO', 'Moved stop', 'Early entry', 'Early exit', 'Revenge trade', 'Oversized', 'No plan', 'Overtrading']

function newTrade(defaults?: Partial<Trade>): Trade {
  const s = getState()
  const now = new Date()
  now.setSeconds(0, 0)
  return {
    id: uid(), accountId: s.filters.accountId !== 'all' ? s.filters.accountId : s.accounts[0].id,
    symbol: '', side: 'long', qty: 1, multiplier: 1,
    entryTime: new Date(now.getTime() - 15 * 60000).toISOString(), exitTime: now.toISOString(),
    entryPrice: 0, exitPrice: 0, pnl: 0, fees: 0, tags: [], mistakes: [], notes: '', images: [], source: 'manual', ...defaults,
  }
}
const calcPnl = (t: Trade) => Math.round((t.exitPrice - t.entryPrice) * (t.side === 'long' ? 1 : -1) * t.qty * (t.multiplier || 1) * 100) / 100
const execsOf = (t: Trade): Execution[] => (t.executions?.length ? t.executions : [
  { time: t.entryTime, side: t.side === 'long' ? 'buy' : 'sell', qty: t.qty, price: t.entryPrice },
  { time: t.exitTime, side: t.side === 'long' ? 'sell' : 'buy', qty: t.qty, price: t.exitPrice },
])

function Thumb({ id, onRemove, onOpen }: { id: string; onRemove: () => void; onOpen: (src: string) => void }) {
  const src = useImage(id)
  return (
    <div className="thumb">
      {src ? <img src={src} onClick={() => onOpen(src)} alt="Screenshot" /> : <div style={{ height: 130 }} />}
      <button type="button" onClick={onRemove}>×</button>
    </div>
  )
}

/** Price/time map of the trade: fills as markers, stop/target/entry as levels. */
function TradePath({ t }: { t: Trade }) {
  if (!t.entryPrice || !t.exitPrice) return <div className="empty">Enter entry and exit prices to see the trade map</div>
  const execs = execsOf(t)
  const win = net(t) >= 0
  const levels = [
    { p: t.takeProfit, label: 'Target', color: 'var(--pos)' },
    { p: t.entryPrice, label: 'Entry', color: 'var(--muted)' },
    { p: t.exitPrice, label: 'Exit', color: win ? 'var(--pos)' : 'var(--neg)' },
    { p: t.stopLoss, label: 'Stop', color: 'var(--neg)' },
  ].filter((l) => l.p) as { p: number; label: string; color: string }[]
  const prices = [...execs.map((e) => e.price), ...levels.map((l) => l.p)]
  const W = 560, H = 240, padL = 16, padR = 110, padY = 24
  const min = Math.min(...prices), max = Math.max(...prices), span = max - min || 1
  const t0 = +new Date(execs[0].time), t1 = +new Date(execs[execs.length - 1].time), ts = t1 - t0 || 1
  const x = (time: string) => padL + 14 + ((+new Date(time) - t0) / ts) * (W - padL - padR - 28)
  const y = (p: number) => padY + (1 - (p - min) / span) * (H - padY * 2)
  // Push labels apart so close price levels stay readable.
  const labels = [...levels].sort((a, b) => y(a.p) - y(b.p)).map((l) => ({ ...l, ly: y(l.p) }))
  for (let i = 1; i < labels.length; i++) if (labels[i].ly - labels[i - 1].ly < 14) labels[i].ly = labels[i - 1].ly + 14
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }}>
      {levels.map((l) => <line key={l.label} x1={padL} x2={W - padR} y1={y(l.p)} y2={y(l.p)} stroke={l.color} strokeDasharray="5 4" strokeWidth={1} opacity={0.7} />)}
      {labels.map((l) => <text key={l.label} x={W - padR + 8} y={l.ly + 4} fontSize={11} fill={l.color} fontWeight={600}>{l.label} {px(l.p)}</text>)}
      <rect x={x(execs[0].time)} width={Math.max(2, x(execs[execs.length - 1].time) - x(execs[0].time))}
        y={Math.min(y(t.entryPrice), y(t.exitPrice))} height={Math.max(2, Math.abs(y(t.entryPrice) - y(t.exitPrice)))} fill={win ? 'var(--pos-soft)' : 'var(--neg-soft)'} />
      <polyline fill="none" stroke={win ? 'var(--pos)' : 'var(--neg)'} strokeWidth={2} points={execs.map((e) => `${x(e.time)},${y(e.price)}`).join(' ')} />
      {execs.map((e, i) => {
        const cx = x(e.time), cy = y(e.price), buy = e.side === 'buy'
        return <path key={i} d={buy ? `M${cx} ${cy - 7}l7 12h-14z` : `M${cx} ${cy + 7}l7 -12h-14z`} fill={buy ? 'var(--pos)' : 'var(--neg)'} stroke="var(--panel)" strokeWidth={1.5} />
      })}
    </svg>
  )
}

export default function TradeEditor({ id, defaults, onClose }: { id: string | 'new'; defaults?: Partial<Trade>; onClose: () => void }) {
  const accounts = useStore((s) => s.accounts)
  const playbooks = useStore((s) => s.playbooks)
  const allTrades = useStore((s) => s.trades)
  const isNew = id === 'new'
  const [t, setT] = useState<Trade>(() => (isNew ? newTrade(defaults) : { ...getState().trades.find((x) => x.id === id)! }))
  const [autoPnl, setAutoPnl] = useState(() => isNew || Math.abs(calcPnl(t) - t.pnl) < 0.011)
  const [tab, setTab] = useState<'map' | 'tv' | 'shots'>('map')
  const [light, setLight] = useState<string | null>(null)
  const [tvSym, setTvSym] = useState('')
  const [origImages] = useState(t.images)
  const up = (patch: Partial<Trade>) => setT((prev) => {
    const next = { ...prev, ...patch }
    if (autoPnl) next.pnl = calcPnl(next)
    return next
  })
  const n = (v: string) => (v === '' ? undefined : parseFloat(v))
  const knownTags = useMemo(() => [...new Set(allTrades.flatMap((x) => x.tags))], [allTrades])
  const knownMistakes = useMemo(() => [...new Set([...allTrades.flatMap((x) => x.mistakes), ...BASE_MISTAKES])], [allTrades])
  const setup = playbooks.find((p) => p.id === t.setupId)
  const r = rMultiple(t)
  const plannedRR = t.stopLoss && t.takeProfit && t.entryPrice ? Math.abs(t.takeProfit - t.entryPrice) / Math.abs(t.entryPrice - t.stopLoss) : null
  const snapshot = tvSnapshotImage(t.tvLink)

  const addImages = async (files: Iterable<File>) => {
    const ids: string[] = []
    for (const f of files) if (f.type.startsWith('image/')) ids.push(await saveImage(f))
    if (ids.length) { setT((p) => ({ ...p, images: [...p.images, ...ids] })); setTab('shots') }
  }
  useEffect(() => {
    const h = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files || [])]
      if (files.length) addImages(files)
    }
    window.addEventListener('paste', h)
    return () => window.removeEventListener('paste', h)
  }, [])

  const save = () => {
    if (!t.symbol.trim()) return alert('Symbol is required')
    origImages.filter((i) => !t.images.includes(i)).forEach(removeImage) // delete removed screenshots only once the edit is saved
    upsertTrade({ ...t, symbol: t.symbol.trim().toUpperCase(), demo: false })
    onClose()
  }
  const remove = () => { if (confirm('Delete this trade?')) { deleteTrades([t.id]); onClose() } }
  const onSymbol = (symbol: string) => up({ symbol, multiplier: isNew || !t.multiplier ? guessMultiplier(symbol) : t.multiplier })
  const autoRisk = () => t.stopLoss && t.entryPrice && up({ risk: Math.round(Math.abs(t.entryPrice - t.stopLoss) * t.qty * (t.multiplier || 1) * 100) / 100 })
  const summary = (label: string, value: React.ReactNode) => <div><div className="stat-label">{label}</div><b className="num" style={{ fontSize: 15 }}>{value}</b></div>

  return (
    <Modal wide onClose={onClose}
      title={<span className="row">{isNew ? 'Add trade' : t.symbol}{!isNew && <span className={cls('chip', t.side === 'long' ? 'pos' : 'neg')}>{t.side === 'long' ? 'Long' : 'Short'}</span>}</span>}
      footer={<>
        <button className="btn primary" onClick={save}>Save trade</button>
        <button className="btn" onClick={onClose}>Cancel</button>
        <div className="grow" />
        {!isNew && <button className="btn danger" onClick={remove}><Icon name="trash" size={15} />Delete</button>}
      </>}>
      <div className="row wrap" style={{ gap: 34, paddingBottom: 16, marginBottom: 18, borderBottom: '1px solid var(--line)' }}>
        {summary('Net P&L', <span style={{ fontSize: 20 }}><Money v={net(t)} /></span>)}
        {summary('R-multiple', r === null ? '—' : `${num(r)}R`)}
        {summary('Planned R:R', plannedRR ? `1 : ${num(plannedRR)}` : '—')}
        {summary('Duration', duration(holdMin(t)))}
        {summary('Fees', <Money v={-t.fees} plain />)}
      </div>
      <div className="grid g2" style={{ alignItems: 'start', gap: 26 }}>
        <div className="col" style={{ gap: 14 }}>
          <div className="section-title">Trade</div>
          <div className="grid g3" style={{ gap: 10 }}>
            <Field label="Symbol"><input className="input" value={t.symbol} onChange={(e) => onSymbol(e.target.value)} placeholder="NQ, EURUSD, AAPL" autoFocus={isNew} /></Field>
            <Field label="Side"><Seg value={t.side} onChange={(side) => up({ side })} options={[['long', 'Long'], ['short', 'Short']]} /></Field>
            <Field label="Account">
              <select className="input" value={t.accountId} onChange={(e) => up({ accountId: e.target.value })}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Entry time"><input type="datetime-local" className="input" value={toLocalInput(t.entryTime)} onChange={(e) => e.target.value && up({ entryTime: fromLocalInput(e.target.value) })} /></Field>
            <Field label="Exit time"><input type="datetime-local" className="input" value={toLocalInput(t.exitTime)} onChange={(e) => e.target.value && up({ exitTime: fromLocalInput(e.target.value) })} /></Field>
            <Field label="Quantity"><input type="number" className="input" value={t.qty} onChange={(e) => up({ qty: n(e.target.value) ?? 0 })} /></Field>
            <Field label="Entry price"><input type="number" className="input" value={t.entryPrice || ''} onChange={(e) => up({ entryPrice: n(e.target.value) ?? 0 })} /></Field>
            <Field label="Exit price"><input type="number" className="input" value={t.exitPrice || ''} onChange={(e) => up({ exitPrice: n(e.target.value) ?? 0 })} /></Field>
            <Field label="Point value"><input type="number" className="input" value={t.multiplier} onChange={(e) => up({ multiplier: n(e.target.value) ?? 1 })} /></Field>
            <Field label={autoPnl ? 'Gross P&L (auto)' : 'Gross P&L (manual)'}>
              <div className="row" style={{ gap: 6 }}>
                <input type="number" className="input" value={t.pnl} disabled={autoPnl} onChange={(e) => setT({ ...t, pnl: n(e.target.value) ?? 0 })} />
                <button type="button" className="btn sm" title="Switch between automatic calculation and manual entry"
                  onClick={() => { const a = !autoPnl; setAutoPnl(a); if (a) setT({ ...t, pnl: calcPnl(t) }) }}>{autoPnl ? 'Edit' : 'Auto'}</button>
              </div>
            </Field>
            <Field label="Fees"><input type="number" className="input" value={t.fees || ''} onChange={(e) => up({ fees: n(e.target.value) ?? 0, feesAuto: false })} /></Field>
          </div>

          <div className="section-title">Risk</div>
          <div className="grid g3" style={{ gap: 10 }}>
            <Field label="Stop loss"><input type="number" className="input" value={t.stopLoss ?? ''} onChange={(e) => up({ stopLoss: n(e.target.value) })} /></Field>
            <Field label="Profit target"><input type="number" className="input" value={t.takeProfit ?? ''} onChange={(e) => up({ takeProfit: n(e.target.value) })} /></Field>
            <Field label="Planned risk (1R)">
              <div className="row" style={{ gap: 6 }}>
                <input type="number" className="input" value={t.risk ?? ''} onChange={(e) => up({ risk: n(e.target.value) })} />
                <button type="button" className="btn sm" onClick={autoRisk} disabled={!t.stopLoss} title="Calculate from the stop">Calc</button>
              </div>
            </Field>
            <Field label="MAE (max adverse)"><input type="number" className="input" value={t.mae ?? ''} onChange={(e) => up({ mae: n(e.target.value) })} /></Field>
            <Field label="MFE (max favorable)"><input type="number" className="input" value={t.mfe ?? ''} onChange={(e) => up({ mfe: n(e.target.value) })} /></Field>
          </div>

          <div className="section-title">Review</div>
          <div className="grid g3" style={{ gap: 10 }}>
            <Field label="Playbook">
              <select className="input" value={t.setupId || ''} onChange={(e) => up({ setupId: e.target.value || undefined, rulesFollowed: [] })}>
                <option value="">None</option>
                {playbooks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Emotion">
              <select className="input" value={t.emotion || ''} onChange={(e) => up({ emotion: e.target.value || undefined })}>
                <option value="">—</option>
                {EMOTIONS.map((e) => <option key={e}>{e}</option>)}
              </select>
            </Field>
            <Field label="Execution rating">
              <div className="stars">{[1, 2, 3, 4, 5].map((i) => <button type="button" key={i} className={cls((t.rating || 0) >= i && 'on')} onClick={() => up({ rating: t.rating === i ? undefined : i })}>★</button>)}</div>
            </Field>
          </div>
          {setup && setup.rules.length > 0 && (
            <Field label={`Playbook rules — ${(t.rulesFollowed || []).length} of ${setup.rules.length} followed`}>
              <div className="col" style={{ gap: 6, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--panel2)' }}>
                {setup.rules.map((rule) => {
                  const on = (t.rulesFollowed || []).includes(rule)
                  return (
                    <label key={rule} className="row" style={{ cursor: 'pointer' }}>
                      <input type="checkbox" checked={on} onChange={() => up({ rulesFollowed: on ? (t.rulesFollowed || []).filter((x) => x !== rule) : [...(t.rulesFollowed || []), rule] })} />
                      {rule}
                    </label>
                  )
                })}
              </div>
            </Field>
          )}
          <Field label="Tags"><TagInput value={t.tags} onChange={(tags) => up({ tags })} suggestions={knownTags} placeholder="Add a tag and press Enter" tone="accent" /></Field>
          <Field label="Mistakes"><TagInput value={t.mistakes} onChange={(mistakes) => up({ mistakes })} suggestions={knownMistakes} placeholder="Add a mistake and press Enter" tone="neg" /></Field>
          <Field label="Notes"><textarea className="input" rows={4} value={t.notes} onChange={(e) => up({ notes: e.target.value })} placeholder="What did you see? Why did you enter? What did you learn?" /></Field>
        </div>

        <div className="col" style={{ gap: 12 }}>
          <Seg value={tab} onChange={setTab} options={[['map', 'Trade map'], ['tv', 'Chart'], ['shots', `Screenshots (${t.images.length + (snapshot ? 1 : 0)})`]]} />
          {tab === 'map' && (
            <>
              <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 8 }}><TradePath t={t} /></div>
              <div className="table-wrap" style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
                <table className="t">
                  <thead><tr><th>Execution time</th><th>Action</th><th className="r">Qty</th><th className="r">Price</th></tr></thead>
                  <tbody>
                    {execsOf(t).map((e, i) => (
                      <tr key={i}><td className="num">{dateTime(e.time)}</td><td className={e.side === 'buy' ? 'pos' : 'neg'}><b>{e.side === 'buy' ? 'Buy' : 'Sell'}</b></td><td className="r num">{e.qty}</td><td className="r num">{px(e.price)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {t.mfe ? <div className="muted">Captured <b className="num" style={{ color: 'var(--text)' }}>{num(Math.max(0, (net(t) / t.mfe) * 100), 0)}%</b> of the best available move (net P&L ÷ MFE).</div> : null}
            </>
          )}
          {tab === 'tv' && (
            t.symbol ? <>
              <div className="row">
                <input className="input" placeholder={`TradingView symbol (default ${tvEmbedSymbol(t.symbol)})`} value={tvSym} onChange={(e) => setTvSym(e.target.value)} />
                <a className="btn sm" target="_blank" rel="noreferrer" href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSym || tvSymbol(t.symbol))}`}>Open in TradingView</a>
              </div>
              <TvChart symbol={tvSym || tvEmbedSymbol(t.symbol)} height={470} />
              {isFuture(t.symbol) && !tvSym && <div className="faint" style={{ fontSize: 12 }}>Futures aren't available in TradingView's embedded chart, so the matching market ({tvEmbedSymbol(t.symbol)}) is shown. "Open in TradingView" opens the contract itself.</div>}
            </> : <div className="empty">Enter a symbol to load a chart</div>
          )}
          {tab === 'shots' && (
            <>
              <Field label="TradingView link (chart snapshot or idea)">
                <div className="row">
                  <input className="input" value={t.tvLink || ''} onChange={(e) => up({ tvLink: e.target.value || undefined })} placeholder="https://www.tradingview.com/x/..." />
                  {t.tvLink && <a className="btn sm" href={t.tvLink} target="_blank" rel="noreferrer"><Icon name="link" size={15} /></a>}
                </div>
              </Field>
              {snapshot && <div className="thumb"><img src={snapshot} style={{ height: 'auto' }} onClick={() => setLight(snapshot)} alt="TradingView snapshot" onError={(e) => ((e.target as HTMLElement).parentElement!.style.display = 'none')} /></div>}
              <label className="drop" style={{ padding: '26px 20px' }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addImages(e.dataTransfer.files) }}>
                <Icon name="image" size={24} />
                <div style={{ marginTop: 6 }}>Drop screenshots here, click to browse, or paste (Ctrl/⌘+V)</div>
                <input type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && addImages(e.target.files)} />
              </label>
              <div className="grid g2" style={{ gap: 10 }}>
                {t.images.map((img) => <Thumb key={img} id={img} onOpen={setLight} onRemove={() => setT((p) => ({ ...p, images: p.images.filter((x) => x !== img) }))} />)}
              </div>
            </>
          )}
        </div>
      </div>
      {light && <div className="lightbox" onClick={() => setLight(null)}><img src={light} alt="" /></div>}
    </Modal>
  )
}
