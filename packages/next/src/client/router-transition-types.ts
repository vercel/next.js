export type RouterTransitionType = 'push' | 'replace' | 'traverse'

export type RouterTransitionPrefetchIntent = 'full' | 'auto' | 'none'

export type RouterTransitionEvent = {
  id: string
  timestamp: number
}

export type RouterTransitionStartEvent = RouterTransitionEvent & {
  fromRoutes: string[]
  // `null` for non-prefetch transitions.
  prefetchIntent: RouterTransitionPrefetchIntent | null
}

export type ClientInstrumentationHooks = {
  onRouterTransitionStart?: (
    url: string,
    navigationType: RouterTransitionType,
    event: RouterTransitionStartEvent | null
  ) => void
}

export type ClientInstrumentationModule =
  | ClientInstrumentationHooks
  | null
  | undefined

export type ClientInstrumentationModules =
  readonly ClientInstrumentationModule[]
