import { createContext, useContext } from 'react'

export const RefreshContext = createContext((_props?: any) => {})

export function useRefreshRoot() {
  return useContext(RefreshContext)
}
