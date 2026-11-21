import React, { useMemo, useState } from 'react'
import { Card } from '../components/ui'
import { TvChart, TvEconomicCalendar, TvTickerTape } from '../components/charts'
import { useStore } from '../lib/store'
import { rootSymbol, tvEmbedSymbol, tvSymbol } from '../lib/instruments'

export default function Market() {
  const trades = useStore((s) => s.trades)
  const mine = useMemo(() => {
    const c = new Map<string, number>()
    trades.forEach((t) => { const r = rootSymbol(t.symbol); c.set(r, (c.get(r) || 0) + 1) })
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([s]) => s)
  }, [trades])
  const [sym, setSym] = useState(() => (mine[0] ? tvEmbedSymbol(mine[0]) : 'OANDA:NAS100USD'))
  const [text, setText] = useState('')
  return (
    <>
      <TvTickerTape />
      <div className="row wrap">
        {mine.map((s) => <button key={s} className={`chip ${tvEmbedSymbol(s) === sym ? 'accent' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setSym(tvEmbedSymbol(s))}>{s}</button>)}
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) setSym(tvEmbedSymbol(text.trim())) }}>
          <input className="input" style={{ width: 220 }} placeholder="Symbol, e.g. NASDAQ:AAPL" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn sm">Load</button>
        </form>
        <a className="btn sm" href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(sym)}`} target="_blank" rel="noreferrer">Open in TradingView</a>
      </div>
      <div className="grid g21">
        <Card style={{ padding: 6 }}><TvChart symbol={sym} interval="15" height={600} /></Card>
        <Card title="Economic calendar" style={{ padding: 10 }}><TvEconomicCalendar height={560} /></Card>
      </div>
    </>
  )
}
