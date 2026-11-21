import { createContext, useContext } from 'react'
import type { Trade } from './lib/types'

// Lives in its own module so the navigation context survives hot reloads of App.
export type Page = 'dashboard' | 'calendar' | 'trades' | 'journal' | 'reports' | 'forecast' | 'coach' | 'playbooks' | 'market' | 'import' | 'settings'
export interface Nav {
  page: Page
  go: (p: Page) => void
  openTrade: (id: string | 'new', defaults?: Partial<Trade>) => void
  openDay: (date: string) => void
  day: string | null
}
export const NavCtx = createContext<Nav>(null as any)
export const useNav = () => useContext(NavCtx)

