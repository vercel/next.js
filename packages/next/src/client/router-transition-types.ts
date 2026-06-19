export type RouterTransitionType = 'push' | 'replace' | 'traverse'

export type RouterTransitionPrefetchIntent = 'full' | 'auto' | 'none'

export type RouterTransitionEvent = {
  id: string
  timestamp: number
}

export type RouterTransitionStartEvent = RouterTransitionEvent & {
  fromRoutes: string[]
  // `null` for programmatic navigations (`router.push()`/`router.replace()`),
  // which have no associated link and therefore no prefetch intent.
  prefetchIntent: RouterTransitionPrefetchIntent | null
}

export type ClientInstrumentationHooks = {
  onRouterTransitionStart?: (
    url: string,
    navigationType: RouterTransitionType,
    event?: RouterTransitionStartEvent
  ) => void
}

export type ClientInstrumentationModule =
  | ClientInstrumentationHooks
  | null
  | undefined

export type ClientInstrumentationModules =
  readonly ClientInstrumentationModule[]
