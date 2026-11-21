import React, { useMemo, useState } from 'react'
import { Card, download, Field, Icon, Money, Seg } from '../components/ui'
import { exportBackup, getState, importBackup, setState, useStore } from '../lib/store'
import { buildTrades, FIELD_LABELS, parseFile, toCsv, tradeKey, type Field as F, type Parsed } from '../lib/importers'
import { net } from '../lib/stats'
import { cls, dateTime, px } from '../lib/format'
import { useNav } from '../App'
import TradovateSync from '../components/TradovateSync'
import { currentRates, withFeeRates } from '../lib/fees'

const FIELDS: Record<Parsed['mode'], F[]> = {
  trades: ['symbol', 'side', 'qty', 'entryTime', 'exitTime', 'entryPrice', 'exitPrice', 'pnl', 'fees', 'swap', 'stopLoss', 'takeProfit', 'mae', 'mfe', 'notes'],
  executions: ['symbol', 'side', 'qty', 'price', 'time', 'fees'],
  buysell: ['symbol', 'qty', 'buyPrice', 'sellPrice', 'buyTime', 'sellTime', 'pnl', 'fees'],
}

const GUIDES: [string, string][] = [
  ['Tradovate', 'Account Reports → download the Performance or Orders report as CSV. Or use the live sync below.'],
  ['TradeLocker', 'Export your closed positions (History) to CSV.'],
  ['MetaTrader 4 / 5', 'History tab → right-click → Report → save as HTML or CSV.'],
  ['NinjaTrader', 'Trade Performance → Trades tab → right-click → Export to CSV.'],
  ['Any other broker', 'Any CSV with one row per closed trade or one row per fill. Columns are detected automatically and can be remapped.'],
]

export default function ImportPage() {
  const accounts = useStore((s) => s.accounts)
  const nav = useNav()
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [fileName, setFileName] = useState('')
  const [accountId, setAccountId] = useState(accounts[0].id)
  const [dayFirst, setDayFirst] = useState(getState().settings.dayFirst)
  const [over, setOver] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = async (file: File) => {
    setMsg(null)
    try {
      const text = await file.text()
      if (/\.json$/i.test(file.name)) {
        if (!confirm('Restoring a backup replaces everything currently in the journal. Continue?')) return
        await importBackup(text)
        setMsg({ ok: true, text: 'Backup restored' })
        return
      }
      setParsed(parseFile(file.name, text))
      setFileName(file.name)
    } catch (e: any) {
      setParsed(null)
      setMsg({ ok: false, text: 'Could not read the file: ' + (e?.message || e) })
    }
  }

  const result = useMemo(() => {
    if (!parsed) return null
    try { return { ...buildTrades(parsed, accountId, dayFirst), error: null as string | null } }
    catch (e: any) { return { trades: [], skipped: 0, errors: [], error: e.message as string } }
  }, [parsed, accountId, dayFirst])
  const existing = useStore((s) => s.trades)
  const fresh = useMemo(() => {
    if (!result) return []
    const keys = new Set(existing.map(tradeKey))
    return withFeeRates(result.trades.filter((t) => !keys.has(tradeKey(t))), currentRates())
  }, [result, existing])

  const doImport = () => {
    if (!fresh.length) return
    const count = fresh.length
    setState((s) => ({ trades: [...s.trades, ...withFeeRates(fresh, currentRates())] }))
    setParsed(null)
    setMsg({ ok: true, text: `Imported ${count} new trades` })
  }
  const setMap = (f: F, v: string) => setParsed((p) => p && { ...p, mapping: { ...p.mapping, [f]: v === '' ? undefined : +v } })

  return (
    <>
      {msg && <div className={cls('banner', !msg.ok && 'err')}>
        <span>{msg.text}</span>{msg.ok && <button className="btn sm" onClick={() => nav.go('trades')}>View trades</button>}
      </div>}

      {!parsed ? (
        <label className={cls('drop', over && 'over')} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); e.dataTransfer.files[0] && load(e.dataTransfer.files[0]) }}>
          <Icon name="upload" size={30} />
          <h2 style={{ marginTop: 10, color: 'var(--text)' }}>Drop a trade file here, or click to browse</h2>
          <div style={{ marginTop: 4 }}>CSV / TXT from any broker · MetaTrader HTML report · journal backup (JSON)</div>
          <input type="file" hidden accept=".csv,.txt,.tsv,.html,.htm,.json" onChange={(e) => { e.target.files?.[0] && load(e.target.files[0]); e.target.value = '' }} />
        </label>
      ) : (
        <Card title={<span className="row wrap">{fileName}<span className="chip accent">{parsed.format}</span><span className="chip">{parsed.rows.length} rows</span></span>}
          right={<button className="btn ghost sm" onClick={() => setParsed(null)}>Cancel</button>}>
          <div className="row wrap" style={{ alignItems: 'flex-end', marginBottom: 16, gap: 16 }}>
            <Field label="File layout">
              <Seg value={parsed.mode} onChange={(mode) => setParsed({ ...parsed, mode })} options={[['trades', 'One row per trade'], ['executions', 'One row per fill'], ['buysell', 'Buy/sell pair per row']]} />
            </Field>
            <Field label="Date format">
              <Seg value={dayFirst ? 'd' : 'm'} onChange={(v) => setDayFirst(v === 'd')} options={[['m', 'MM/DD'], ['d', 'DD/MM']]} />
            </Field>
            <Field label="Import into" style={{ width: 200 }}>
              <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </Field>
          </div>
          <div className="section-title" style={{ marginBottom: 8 }}>Column mapping</div>
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
          {result?.error ? <div className="banner err" style={{ marginTop: 14 }}>{result.error}</div> : result && (
            <>
              <div className="row wrap" style={{ margin: '18px 0 10px' }}>
                <span className="chip pos">{result.trades.length} trades detected</span>
                {result.trades.length - fresh.length > 0 && <span className="chip">{result.trades.length - fresh.length} already in the journal</span>}
                {result.skipped > 0 && <span className="chip">{result.skipped} non-trade rows skipped</span>}
                <span className="muted">Net P&L: <b><Money v={fresh.reduce((s, t) => s + net(t), 0)} /></b></span>
              </div>
              <div className="table-wrap" style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
                <table className="t">
                  <thead><tr><th>Entry</th><th>Exit</th><th>Symbol</th><th>Side</th><th className="r">Qty</th><th className="r">Entry price</th><th className="r">Exit price</th><th className="r">Fees</th><th className="r">Net P&L</th></tr></thead>
                  <tbody>
                    {result.trades.slice(0, 6).map((t) => (
                      <tr key={t.id}><td className="num">{dateTime(t.entryTime)}</td><td className="num">{dateTime(t.exitTime)}</td><td><b>{t.symbol}</b></td>
                        <td>{t.side === 'long' ? 'Long' : 'Short'}</td><td className="r num">{t.qty}</td><td className="r num">{px(t.entryPrice)}</td><td className="r num">{px(t.exitPrice)}</td><td className="r num">{t.fees}</td><td className="r"><Money v={net(t)} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.trades.length > 6 && <div className="faint" style={{ marginTop: 6 }}>Showing the first 6 of {result.trades.length}</div>}
              <button className="btn primary" style={{ marginTop: 14 }} disabled={!fresh.length} onClick={doImport}>Import {fresh.length} trades</button>
            </>
          )}
        </Card>
      )}

      <TradovateSync onDone={() => nav.go('trades')} />

      <Card title="How to export from your broker">
        {GUIDES.map(([name, text]) => <div key={name} className="kv" style={{ justifyContent: 'flex-start' }}><span style={{ width: 150, flex: 'none', color: 'var(--text)', fontWeight: 600 }}>{name}</span><span style={{ fontWeight: 400 }} className="muted">{text}</span></div>)}
      </Card>

      <Card title="Export & backup">
        <div className="row wrap">
          <button className="btn" onClick={() => download('trades.csv', toCsv(getState().trades, (id) => getState().playbooks.find((p) => p.id === id)?.name ?? ''), 'text/csv')}><Icon name="download" size={15} />Export all trades (CSV)</button>
          <button className="btn" onClick={async () => download(`journal-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportBackup(), 'application/json')}><Icon name="download" size={15} />Full backup (with screenshots and notes)</button>
          <span className="muted">To restore, drop the backup file into the import area above.</span>
        </div>
      </Card>
    </>
  )
}
