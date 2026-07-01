'use client'

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

  // Fetch-on-mount Server Actions; getCompanyProfile/getServices are slow, so they
  // are still in flight during the first boundary-gated navigation after load.
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
  return <CompanyProvider>{children}</CompanyProvider>
}
