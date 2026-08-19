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

  const reconcile = () => {
    if (!watchpackRoutes || !bundlerRoutes) return
    if (!announcedRoutes) {
      // The first committed generation from each producer is startup state,
      // not a route change. The client obtains that startup state from the
      // Watchpack-backed dev pages manifest, so only those routes are already
      // announced. A bundler-only startup route is announced later if and
      // when Watchpack publishes it too.
      announcedRoutes = new Set(watchpackRoutes)
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
      (route) => !readyRoutes.has(route)
    )

    announcedRoutes = readyRoutes
    if (added.length > 0 || removed.length > 0) {
      onChanges({ added, removed })
    }
  }

  return {
    updateWatchpack(routes: Iterable<string>) {
      watchpackRoutes = new Set(routes)
      reconcile()
    },
    updateBundler(routes: Iterable<string>) {
      bundlerRoutes = new Set(routes)
      reconcile()
    },
  }
}
