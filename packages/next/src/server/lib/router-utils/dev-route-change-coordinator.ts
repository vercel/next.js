export type DevRouteChanges = {
  added: string[]
  removed: string[]
}

export function createDevRouteChangeCoordinator(
  onChanges: (changes: DevRouteChanges) => void
) {
  let watchpackRoutes: Set<string> | undefined
  let bundlerRoutes: Set<string> | undefined
  let announcedRoutes: Set<string> | undefined
  const observedWatchpackRoutes = new Set<string>()

  const reconcile = () => {
    if (!watchpackRoutes || !bundlerRoutes) return
    if (!announcedRoutes) {
      // The first committed generation from each producer is startup state,
      // not a route change. Either producer may report first or report a
      // partial startup generation, so neither one alone defines the baseline.
      announcedRoutes = new Set([...watchpackRoutes, ...bundlerRoutes])
      return
    }
    const previousRoutes = announcedRoutes

    const readyRoutes = new Set<string>()
    const allRoutes = new Set([...watchpackRoutes, ...bundlerRoutes])
    for (const route of allRoutes) {
      const watchpackHasRoute = watchpackRoutes.has(route)
      const bundlerHasRoute = bundlerRoutes.has(route)
      if (
        (watchpackHasRoute && bundlerHasRoute) ||
        (watchpackHasRoute !== bundlerHasRoute && previousRoutes.has(route))
      ) {
        readyRoutes.add(route)
      }
    }

    const added = [...readyRoutes].filter((route) => !previousRoutes.has(route))
    const removed = [...previousRoutes].filter(
      (route) => !readyRoutes.has(route) && observedWatchpackRoutes.has(route)
    )

    announcedRoutes = readyRoutes
    for (const route of observedWatchpackRoutes) {
      if (!watchpackRoutes.has(route) && !bundlerRoutes.has(route)) {
        observedWatchpackRoutes.delete(route)
      }
    }
    if (added.length > 0 || removed.length > 0) {
      onChanges({ added, removed })
    }
  }

  return {
    updateWatchpack(routes: Iterable<string>) {
      watchpackRoutes = new Set(routes)
      for (const route of watchpackRoutes) observedWatchpackRoutes.add(route)
      reconcile()
    },
    updateBundler(routes: Iterable<string>) {
      bundlerRoutes = new Set(routes)
      reconcile()
    },
  }
}
