const NOOP = (fn: () => void) => fn()

/**
 * Returns a transition function that can be used to wrap router actions.
 * This allows us to tap into the transition state of the router as an
 * approximation of React render time.
 */
export const useSyncDevRenderIndicator = () => {
  let syncDevRenderIndicator = NOOP

  if (process.env.NODE_ENV === 'development') {
    const { useSyncDevRenderIndicatorInternal } =
      require('./internal/use-sync-dev-render-indicator-internal') as typeof import('./internal/use-sync-dev-render-indicator-internal')

    // eslint-disable-next-line react-hooks/rules-of-hooks
    syncDevRenderIndicator = useSyncDevRenderIndicatorInternal()
  }

  return syncDevRenderIndicator
}
