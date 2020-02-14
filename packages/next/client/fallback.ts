import React from 'react'
import { FallbackContext } from '../next-server/lib/fallback-context'

export function useFallback() {
  return React.useContext(FallbackContext)
}
