import React, { useMemo, useState } from 'react'
import { Card, download, Field, Icon, Money, Seg } from '../components/ui'
import { exportBackup, getState, importBackup, setState, useStore } from '../lib/store'
import { buildTrades, FIELD_LABELS, parseFile, toCsv, tradeKey, type Field as F, type Parsed } from '../lib/importers'
import { net } from '../lib/stats'
import { cls, dateTime, px } from '../lib/format'
import { rootSymbol } from '../lib/instruments'
import { setFeeRate, withFeeRates } from '../lib/fees'
import { useNav } from '../nav'
import TradovateSync from '../components/TradovateSync'

const FIELDS: Record<Parsed['mode'], F[]> = {
  trades: ['symbol', 'side', 'qty', 'entryTime', 'exitTime', 'entryPrice', 'exitPrice', 'pnl', 'fees', 'swap', 'stopLoss', 'takeProfit', 'mae', 'mfe', 'notes'],
  executions: ['symbol', 'side', 'qty', 'price', 'time', 'fees'],
  buysell: ['symbol', 'qty', 'buyPrice', 'sellPrice', 'buyTime', 'sellTime', 'pnl', 'fees'],
}
const GUIDES: [string, string][] = [
  ['Tradovate', 'Account Reports → Performance (or Orders) → download CSV'],
  ['TradeLocker', 'History → export closed positions to CSV'],
  ['MetaTrader 4 / 5', 'History tab → right-click → Report → save as HTML or CSV'],
  ['NinjaTrader', 'Trade Performance → Trades → right-click → Export'],
  ['Other brokers', 'Any CSV with one row per trade or per fill'],
]

/** Step shown after a file is dropped: what was found, the fees that will apply, and one Import button. */
function Review({ parsed, setParsed, fileName, onDone }: { parsed: Parsed; setParsed: (p: Parsed | null) => void; fileName: string; onDone: (count: number) => void }) {
  const accounts = useStore((s) => s.accounts)
  const existing = useStore((s) => s.trades)
  const rates = useStore((s) => s.settings.feeRates) || {}
  const [accountId, setAccountId] = useState(accounts[0].id)
  const [dayFirst, setDayFirst] = useState(getState().settings.dayFirst)
  const [advanced, setAdvanced] = useState(false)
  const result = useMemo(() => {
    try { return { ...buildTrades(parsed, accountId, dayFirst), error: null as string | null } }
    catch (e: any) { return { trades: [], skipped: 0, errors: [], error: e.message as string } }
  }, [parsed, accountId, dayFirst])
  const fresh = useMemo(() => {
    const keys = new Set(existing.map(tradeKey))
    return withFeeRates(result.trades.filter((t) => !keys.has(tradeKey(t))), rates)
  }, [result, existing, rates])
  const symbols = [...new Set(fresh.filter((t) => !t.fees || t.feesAuto).map((t) => rootSymbol(t.symbol)))]
  const gross = fresh.reduce((s, t) => s + t.pnl, 0), fees = fresh.reduce((s, t) => s + t.fees, 0)
  const setMap = (f: F, v: string) => setParsed({ ...parsed, mapping: { ...parsed.mapping, [f]: v === '' ? undefined : +v } })
  const tile = (label: string, value: React.ReactNode) => <div><div className="stat-label">{label}</div><b className="num" style={{ fontSize: 18 }}>{value}</b></div>

  return (
    <Card title={<span className="row wrap">{fileName}<span className="chip accent">{parsed.format}</span></span>} right={<button className="btn ghost sm" onClick={() => setParsed(null)}>Cancel</button>}>
      {result.error ? <div className="banner err">{result.error} — open "Adjust columns" below to fix it.</div> : (
        <>
          <div className="row wrap" style={{ gap: 36, marginBottom: 16 }}>
            {tile('New trades', fresh.length)}
            {tile('Gross P&L', <Money v={gross} />)}
            {tile('Fees', <Money v={-fees} plain />)}
            {tile('Net P&L', <Money v={gross - fees} />)}
            {result.trades.length - fresh.length > 0 && tile('Already in journal', result.trades.length - fresh.length)}
          </div>
          {symbols.length > 0 && (
            <div className="row wrap" style={{ alignItems: 'flex-end', marginBottom: 16, padding: '12px 14px', background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 10 }}>
              <span className="muted" style={{ paddingBottom: 8 }}>This file has no fees. Commission per contract, per side:</span>
              {symbols.map((s) => (
                <Field key={s} label={s} style={{ width: 110 }}>
                  <input type="number" step="0.01" min={0} className="input" placeholder="0.00" value={rates[s] ?? ''} onChange={(e) => setFeeRate(s, e.target.value === '' ? undefined : +e.target.value)} />
                </Field>
              ))}
            </div>
          )}
          <div className="table-wrap" style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
            <table className="t">
              <thead><tr><th>Entry</th><th>Symbol</th><th>Side</th><th className="r">Qty</th><th className="r">Entry price</th><th className="r">Exit price</th><th className="r">Fees</th><th className="r">Net P&L</th></tr></thead>
              <tbody>
                {fresh.slice(0, 6).map((t) => (
                  <tr key={t.id}><td className="num">{dateTime(t.entryTime)}</td><td><b>{t.symbol}</b></td><td>{t.side === 'long' ? 'Long' : 'Short'}</td>
                    <td className="r num">{t.qty}</td><td className="r num">{px(t.entryPrice)}</td><td className="r num">{px(t.exitPrice)}</td><td className="r num">{t.fees.toFixed(2)}</td><td className="r"><b><Money v={net(t)} /></b></td></tr>
                ))}
                {fresh.length === 0 && <tr><td colSpan={8} className="muted">All trades in this file are already in the journal.</td></tr>}
              </tbody>
            </table>
          </div>
          {fresh.length > 6 && <div className="faint" style={{ marginTop: 6 }}>Showing the first 6 of {fresh.length}</div>}
        </>
      )}
      <div className="row wrap" style={{ marginTop: 16 }}>
        <button className="btn primary" disabled={!fresh.length} onClick={() => { setState((s) => ({ trades: [...s.trades, ...fresh] })); onDone(fresh.length) }}>Import {fresh.length} trades</button>
        {accounts.length > 1 && <select className="input" style={{ width: 190 }} value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>Into: {a.name}</option>)}</select>}
        <div className="grow" />
        <button className="btn ghost sm" onClick={() => setAdvanced(!advanced)}>{advanced ? 'Hide column settings' : 'Adjust columns'}</button>
      </div>
      {advanced && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <div className="row wrap" style={{ alignItems: 'flex-end', marginBottom: 12, gap: 16 }}>
            <Field label="File layout"><Seg value={parsed.mode} onChange={(mode) => setParsed({ ...parsed, mode })} options={[['trades', 'One row per trade'], ['executions', 'One row per fill'], ['buysell', 'Buy/sell pair per row']]} /></Field>
            <Field label="Date format"><Seg value={dayFirst ? 'd' : 'm'} onChange={(v) => setDayFirst(v === 'd')} options={[['m', 'MM/DD'], ['d', 'DD/MM']]} /></Field>
          </div>
          <div className="grid g5" style={{ gap: 10 }}>
            {FIELDS[parsed.mode].map((f) => (
              <Field key={f} label={FIELD_LABELS[f]}>
                <select className="input" value={parsed.mapping[f] ?? ''} onChange={(e) => setMap(f, e.target.value)}>
                  <option value="">—</option>
                  {parsed.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </Field>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

export default function ImportPage() {
  const nav = useNav()
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [fileName, setFileName] = useState('')
  const [over, setOver] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = async (file: File) => {
    setMsg(null)
    try {
      const text = await file.text()
      if (/\.json$/i.test(file.name)) {
        if (!confirm('Restoring a backup replaces everything currently in the journal. Continue?')) return
        await importBackup(text)
        return setMsg({ ok: true, text: 'Backup restored' })
      }
      setParsed(parseFile(file.name, text))
      setFileName(file.name)
    } catch (e: any) {
      setParsed(null)
      setMsg({ ok: false, text: 'Could not read the file: ' + (e?.message || e) })
    }
  }

  return (
    <>
      {msg && <div className={cls('banner', !msg.ok && 'err')}><span>{msg.text}</span>{msg.ok && <button className="btn sm" onClick={() => nav.go('dashboard')}>Go to dashboard</button>}</div>}

      {parsed ? <Review parsed={parsed} setParsed={setParsed} fileName={fileName} onDone={(n) => { setParsed(null); setMsg({ ok: true, text: `Imported ${n} trades` }) }} /> : (
        <label className={cls('drop', over && 'over')} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); e.dataTransfer.files[0] && load(e.dataTransfer.files[0]) }}>
          <Icon name="upload" size={30} />
          <h2 style={{ marginTop: 10, color: 'var(--text)' }}>Drop your trades file here</h2>
          <div style={{ marginTop: 4 }}>or click to choose a file from your broker</div>
          <input type="file" hidden accept=".csv,.txt,.tsv,.html,.htm,.json" onChange={(e) => { e.target.files?.[0] && load(e.target.files[0]); e.target.value = '' }} />
        </label>
      )}

      {!parsed && (
        <>
          <details className="card fold">
            <summary>Where do I find the file?</summary>
            <div style={{ marginTop: 10 }}>
              {GUIDES.map(([name, text]) => <div key={name} className="kv" style={{ justifyContent: 'flex-start' }}><span style={{ width: 150, flex: 'none', color: 'var(--text)', fontWeight: 600 }}>{name}</span><span style={{ fontWeight: 400 }} className="muted">{text}</span></div>)}
            </div>
          </details>
          <details className="card fold">
            <summary>Connect Tradovate for automatic sync</summary>
            <div style={{ marginTop: 14 }}><TradovateSync onDone={() => nav.go('trades')} /></div>
          </details>
          <details className="card fold">
            <summary>Export &amp; backup</summary>
            <div className="row wrap" style={{ marginTop: 14 }}>
              <button className="btn" onClick={() => download('trades.csv', toCsv(getState().trades, (id) => getState().playbooks.find((p) => p.id === id)?.name ?? ''), 'text/csv')}><Icon name="download" size={15} />Export trades (CSV)</button>
              <button className="btn" onClick={async () => download(`journal-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportBackup(), 'application/json')}><Icon name="download" size={15} />Download full backup</button>
              <span className="muted">To restore a backup, drop it into the area above.</span>
            </div>
          </details>
        </>
      )}
    </>
  )
}
