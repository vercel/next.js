'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  getCompanyProfile,
  getCompanyStaff,
  getServices,
  Staff,
} from './actions'

// Mirrors CompanyProvider: a root client provider that fires several fetch-on-mount
// server actions and setState as each resolves, producing trailing context re-renders
// right around the time the freshly-mounted staff table is clicked.

type Nullable<T> = T | null

interface CompanyCtx {
  company: Nullable<{ id: number }>
  staff: Nullable<Staff[]>
  services: { id: number }[]
}

const CompanyContext = createContext<CompanyCtx>({
  company: null,
  staff: null,
  services: [],
})

export const useCompany = (): CompanyCtx => useContext(CompanyContext)

function CompanyProvider({ children }: { children: ReactNode }) {
  const [company, setCompany] = useState<Nullable<{ id: number }>>(null)
  const [staff, setStaff] = useState<Nullable<Staff[]>>(null)
  const [services, setServices] = useState<{ id: number }[]>([])
  const [, setTick] = useState(0)

  // HEARTBEAT (diagnostic, toggled by NEXT_PUBLIC_HEARTBEAT): a burst of urgent
  // setState re-renders for ~1.5s after mount. This stands in for the many async
  // re-render sources a real dashboard has (multiple fetches, refetches, timers) and
  // lets us test whether concurrent urgent re-renders during a pending navigation
  // drop the transition.
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_HEARTBEAT !== '1') return
    let n = 0
    const id = setInterval(() => {
      setTick(++n)
      if (n > 50) clearInterval(id)
    }, 30)
    return () => clearInterval(id)
  }, [])

  // CompanyProvider fires its fetch-on-mount Server Actions once, on mount.
  // getServices/getCompanyProfile are slow (800/600ms), so they are still
  // in-flight during the first boundary-gated navigation after a fresh load —
  // that is ingredient #2 of vercel/next.js#86151. The sampler reloads before
  // each attempt so this in-flight-action window is recreated every time, which
  // is how mogzol's repro reproduces ("after a reload it gets stuck again").
  useEffect(() => {
    getCompanyProfile().then(setCompany)
  }, [])

  useEffect(() => {
    getCompanyStaff().then(setStaff)
  }, [])

  useEffect(() => {
    getServices().then(setServices)
  }, [])

  const value = useMemo(
    () => ({ company, staff, services }),
    [company, staff, services]
  )

  return (
    <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
  )
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <CompanyProvider>{children}</CompanyProvider>
    </QueryClientProvider>
  )
}
