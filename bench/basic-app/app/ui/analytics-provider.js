'use client'
import { createContext, useCallback, useContext } from 'react'

const AnalyticsContext = createContext(() => {})

export function useTrack() {
  return useContext(AnalyticsContext)
}

// Buffers events like real analytics providers; nothing is sent anywhere.
export default function AnalyticsProvider({ app, release, children }) {
  const track = useCallback(
    (event, data) => {
      ;(globalThis.__benchEvents ||= []).push({ app, release, event, data })
    },
    [app, release]
  )
  return (
    <AnalyticsContext.Provider value={track}>
      {children}
    </AnalyticsContext.Provider>
  )
}
