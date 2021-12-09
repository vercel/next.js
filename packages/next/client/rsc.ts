import { createContext, useContext } from 'react'

export const RefreshContext = createContext(() => {})

export function unstable_useRefreshRoot() {
  return useContext(RefreshContext)
}
