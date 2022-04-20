import { useContext } from 'react'
import { RefreshContext } from './refresh'

export function useRefreshRoot() {
  return useContext(RefreshContext)
}
