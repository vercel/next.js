export type RouterTransitionType = 'push' | 'replace' | 'traverse'

export type RouterTransitionPrefetch =
  | 'hit-route'
  | 'hit-shell'
  | 'miss'
  | 'none'

export type RouterTransitionPrefetchIntent = 'full' | 'auto' | 'none'

export type RouterTransitionEvent = {
  id: string
  timestamp: number
}

export type RouterTransitionStartEvent = RouterTransitionEvent & {
  fromRoutes: string[]
  prefetchIntent: RouterTransitionPrefetchIntent
}

export type RouterTransitionCommitEvent = RouterTransitionEvent & {
  routes: string[]
  prefetch: RouterTransitionPrefetch
}

export type RouterTransitionSettledEvent = RouterTransitionEvent

export type RouterTransitionRouteMismatchEvent = RouterTransitionEvent

export type RouterTransitionAbortEvent = RouterTransitionEvent & {
  reason: 'superseded' | 'hard-navigation' | 'error'
}

export type ClientInstrumentationHooks = {
  onRouterTransitionStart?: (
    url: string,
    navigationType: RouterTransitionType,
    event?: RouterTransitionStartEvent
  ) => void
  unstable_onRouterTransitionCommit?: (
    url: string,
    navigationType: RouterTransitionType,
    event: RouterTransitionCommitEvent
  ) => void
  unstable_onRouterTransitionSettled?: (
    url: string,
    navigationType: RouterTransitionType,
    event: RouterTransitionSettledEvent
  ) => void
  unstable_onRouterTransitionRouteMismatch?: (
    url: string,
    navigationType: RouterTransitionType,
    event: RouterTransitionRouteMismatchEvent
  ) => void
  unstable_onRouterTransitionAbort?: (
    url: string,
    navigationType: RouterTransitionType,
    event: RouterTransitionAbortEvent
  ) => void
}

export type ClientInstrumentationModule =
  | ClientInstrumentationHooks
  | null
  | undefined

export type ClientInstrumentationModules =
  readonly ClientInstrumentationModule[]
