export type RouterTransitionType = 'push' | 'replace' | 'traverse'

export type ClientInstrumentationHooks = {
  onRouterTransitionStart?: (
    url: string,
    navigationType: RouterTransitionType
  ) => void
}

export type ClientInstrumentationModule =
  | ClientInstrumentationHooks
  | null
  | undefined

export type ClientInstrumentationModules =
  readonly ClientInstrumentationModule[]
