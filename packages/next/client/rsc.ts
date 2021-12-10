import { createContext, useContext } from 'react'

export const RefreshContext = createContext((_: any) => {})

export function useRefreshRoot() {
  return useContext(RefreshContext)
}
