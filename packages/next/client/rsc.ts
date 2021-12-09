import { createContext, useContext } from 'react'

export const RefreshContext = createContext(() => {})

export function unstable_useRefreshRoot() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useContext(RefreshContext)
}
