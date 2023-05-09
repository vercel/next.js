import { useEffect } from 'react'

export type Harness = typeof import('./harness')

let ranOnce = false
/**
 * Run a callback once the test harness is loaded.
 */
export function useTestHarness<T extends (harness: Harness) => void>(
  callback: T
) {
  useEffect(() => {
    if (ranOnce) {
      return
    }

    ranOnce = true
    import('./harness').then(callback)
  })
}
