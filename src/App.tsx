import React, { useEffect, useMemo, useRef, useState } from 'react'
import { NavCtx, useNav, type Nav, type Page } from './nav'

export { useNav }
import { Field, Icon } from './components/ui'
import { clearDemo, hasDemo, setFilters, setState, useStore, defaultFilters } from './lib/store'
import type { Filters, Trade } from './lib/types'
import { cls } from './lib/format'
import { cloudEnabled, useCloud } from './lib/cloud'
import Dashboard from './pages/Dashboard'
import CalendarPage from './pages/CalendarPage'
import Trades from './pages/Trades'
import Journal from './pages/Journal'
import Reports from './pages/Reports'
import ForecastPage from './pages/ForecastPage'
import Playbooks from './pages/Playbooks'
import ImportPage from './pages/ImportPage'
import SettingsPage from './pages/SettingsPage'
import Market from './pages/Market'
import Coach from './pages/Coach'
import TradeEditor from './pages/TradeEditor'

const NAV: [Page, string, string][] = [
  ['dashboard', 'Dashboard', 'dashboard'], ['journal', 'Daily Journal', 'book'], ['trades', 'Trades', 'list'], ['calendar', 'Calendar', 'calendar'],
  ['reports', 'Reports', 'chart'], ['playbooks', 'Playbooks', 'target'], ['coach', 'Coach', 'spark'], ['forecast', 'Forecast', 'future'], ['market', 'Markets', 'globe'],
]
const NAV2: [Page, string, string][] = [['import', 'Import & Sync', 'upload'], ['settings', 'Settings', 'settings']]
const TITLES = Object.fromEntries([...NAV, ...NAV2].map(([p, l]) => [p, l])) as Record<Page, string>
const RANGES: [Filters['range'], string][] = [['all', 'All time'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['month', 'This month'], ['ytd', 'This year'], ['custom', 'Custom range']]

/** Date range + account stay visible; the less-used filters live in one popover. */
function FilterBar() {
  const f = useStore((s) => s.filters)
  const accounts = useStore((s) => s.accounts)
  const playbooks = useStore((s) => s.playbooks)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const active = [f.symbol, f.side !== 'all', f.setupId, f.tag].filter(Boolean).length
  return (
    <>
      <div className="pop-wrap" ref={ref}>
        <button className="btn" onClick={() => setOpen(!open)}>Filters{active > 0 && <span className="chip accent">{active}</span>}</button>
        {open && (
          <div className="pop">
            <Field label="Symbol"><input className="input" placeholder="e.g. NQ" value={f.symbol} onChange={(e) => setFilters({ symbol: e.target.value })} /></Field>
            <Field label="Side">
              <select className="input" value={f.side} onChange={(e) => setFilters({ side: e.target.value as any })}>
                <option value="all">Long &amp; short</option><option value="long">Long</option><option value="short">Short</option>
              </select>
            </Field>
            <Field label="Playbook">
              <select className="input" value={f.setupId} onChange={(e) => setFilters({ setupId: e.target.value })}>
                <option value="">All playbooks</option>
                {playbooks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setFilters({ ...defaultFilters(), range: f.range, from: f.from, to: f.to, accountId: f.accountId })}>Reset filters</button>
          </div>
        )}
      </div>
      {f.range === 'custom' && (
        <>
          <input type="date" className="input" style={{ width: 140 }} value={f.from || ''} onChange={(e) => setFilters({ from: e.target.value })} />
          <input type="date" className="input" style={{ width: 140 }} value={f.to || ''} onChange={(e) => setFilters({ to: e.target.value })} />
        </>
      )}
      <select className="input" style={{ width: 150 }} value={f.range} onChange={(e) => setFilters({ range: e.target.value as Filters['range'] })}>
        {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <select className="input" style={{ width: 170 }} value={f.accountId} onChange={(e) => setFilters({ accountId: e.target.value })}>
        <option value="all">All accounts</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </>
  )
}

export default function App() {
  const [page, setPageState] = useState<Page>(() => {
    const h = location.hash.slice(1) as Page
    return h in TITLES ? h : 'dashboard'
  })
  // Keep the current screen in the URL so a refresh returns to it.
  const setPage = (p: Page) => { history.replaceState(null, '', '#' + p); setPageState(p) }
  // Follow links and back/forward navigation that only change the #page part of the address.
  useEffect(() => {
    const h = () => { const p = location.hash.slice(1) as Page; if (p in TITLES) setPageState(p) }
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])
  const [editing, setEditing] = useState<{ id: string | 'new'; defaults?: Partial<Trade> } | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const theme = useStore((s) => s.settings.theme)
  const demo = useStore(hasDemo)
  const cloud = useCloud()
  const nav = useMemo<Nav>(() => ({
    page, day,
    go: (p) => { setDay(null); setPage(p) },
    openTrade: (id, defaults) => setEditing({ id, defaults }),
    openDay: (date) => { setDay(date); setPage('journal') },
  }), [page, day])
  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = t
    setState((s) => ({ settings: { ...s.settings, theme: t } }))
  }
  const P = { dashboard: Dashboard, calendar: CalendarPage, trades: Trades, journal: Journal, reports: Reports, forecast: ForecastPage, coach: Coach, playbooks: Playbooks, market: Market, import: ImportPage, settings: SettingsPage }[page]
  const item = ([p, label, icon]: [Page, string, string]) => (
    <button key={p} className={cls('nav-item', page === p && 'active')} onClick={() => nav.go(p)}><Icon name={icon} />{label}</button>
  )
  const filtered = !['import', 'settings', 'market', 'playbooks', 'coach'].includes(page)
  return (
    <NavCtx.Provider value={nav}>
      <div className="app">
        <aside className="sidebar">
          <div className="brand"><div className="brand-mark"><Icon name="chart" size={17} /></div>Trading Journal</div>
          <button className="add-btn" onClick={() => nav.openTrade('new')}><Icon name="plus" size={16} />Add Trade</button>
          {NAV.map(item)}
          <div className="nav-sep" />
          {NAV2.map(item)}
          {cloudEnabled && <button className="nav-item" onClick={() => nav.go('settings')}><Icon name="link" />{cloud.key ? (cloud.status === 'syncing' ? 'Syncing…' : cloud.status === 'error' ? 'Sync problem' : 'Synced') : 'Sync devices'}</button>}
          <button className="nav-item" onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} />{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
        </aside>
        <div className="main">
          <div className="topbar">
            <h1>{TITLES[page]}</h1>
            <div className="grow" />
            {filtered && <FilterBar />}
          </div>
          <div className="content">
            <div className="page">
              {demo && (
                <div className="banner">
                  <span>You're viewing <b>sample data</b>. Import your own trades to get started.</span>
                  <span className="row">
                    <button className="btn sm" onClick={() => nav.go('import')}>Import trades</button>
                    <button className="btn sm ghost" onClick={clearDemo}>Clear sample data</button>
                  </span>
                </div>
              )}
              <P />
            </div>
          </div>
        </div>
        {editing && <TradeEditor id={editing.id} defaults={editing.defaults} onClose={() => setEditing(null)} />}
      </div>
    </NavCtx.Provider>
  )
}
