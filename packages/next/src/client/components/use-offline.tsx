'use client'

import React, {
  createContext,
  useContext,
  useState,
  useOptimistic,
  startTransition,
} from 'react'

const OfflineContext = createContext<boolean>(false)

// Module-level reference to the optimistic setter. Assigned inside the
// provider component on every render. Called by the offline module
// (via dispatchOfflineChange) to update the React tree.
let setOptimistic: ((value: boolean) => void) | null = null
let setCanonical: ((value: boolean) => void) | null = null

/**
 * Called by the offline module when the offline state changes.
 * Dispatches into React via startTransition + useOptimistic.
 */
export function dispatchOfflineChange(isOffline: boolean): void {
  const canonical = setCanonical
  const optimistic = setOptimistic
  if (canonical === null || optimistic === null) {
    return
  }
  startTransition(() => {
    canonical(isOffline)
    optimistic(isOffline)
  })
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [canonicalOffline, setCanonicalOffline] = useState(false)
  const [isOffline, setOptimisticOffline] = useOptimistic(canonicalOffline)

  setOptimistic = setOptimisticOffline
  setCanonical = setCanonicalOffline

  return (
    <OfflineContext.Provider value={isOffline}>
      {children}
    </OfflineContext.Provider>
  )
}

/**
 * Returns whether the app is currently offline.
 * Returns `false` during SSR and hydration.
 */
export function useOffline(): boolean {
  return useContext(OfflineContext)
}
