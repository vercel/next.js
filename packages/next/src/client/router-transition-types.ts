export type RouterTransitionType = 'push' | 'replace' | 'traverse'

export type RouterTransitionPrefetchIntent = 'full' | 'auto' | 'none'

/**
 * A serializable description of a route, used as the `fromTree`/`toTree` of a
 * router transition. Both ends share this shape so consumers can join/group by
 * it (e.g. a hash-only navigation has `fromTree` deep-equal to `toTree`).
 */
export type RouterTreeDescriptor = {
  /**
   * The server's post-rewrite pathname (the route that actually rendered),
   * reconstructed from the concrete route tree. May differ from `canonicalUrl`
   * when a rewrite/intercept occurred.
   */
  renderedPathname: string
  /**
   * The pre-rewrite URL shown in the browser address bar.
   */
  canonicalUrl: string
  /**
   * Route template paths, deepest (leaf/page) first, with parallel-route slots
   * included (as `@slot`). Dynamic segments are positional holes (`:1`, `:2`,
   * ...) rather than param names, so renaming a `[param]` folder does not break
   * log continuity. Best-effort: the `app/` root and `page`/`layout` suffix are
   * not reconstructable on the client.
   */
  routeTemplates: string[]
  /**
   * Dynamic param values, positional by hole order (NOT keyed by param name,
   * which is folder-derived and not rename-stable). A catch-all value is the
   * array of its path segments.
   */
  params: Array<string | string[]>
  /**
   * The post-rewrite search params (from the server-observed `renderedSearch`).
   */
  searchParams: Record<string, string | string[]>
}

export type RouterTransitionEvent = {
  id: string
  timestamp: number
}

export type RouterTransitionStartEvent = RouterTransitionEvent & {
  fromTree: RouterTreeDescriptor
}

export type RouterTransitionCommitEvent = RouterTransitionEvent & {
  toTree: RouterTreeDescriptor
  /**
   * Whether the navigation had renderable prefetched content to commit into.
   * `'miss'` means there was nothing to navigate into (the page segment was not
   * fulfilled in the cache, so the user saw a fallback). The head is excluded
   * from this determination because it streams in non-blocking.
   */
  outcome: 'hit' | 'miss'
}

export type RouterTransitionAbortEvent = RouterTransitionEvent & {
  /**
   * The id of the transition whose commit superseded (and thus aborted) this
   * one.
   */
  cause: string
}

export type ClientInstrumentationHooks = {
  onRouterTransitionStart?: (
    url: string,
    navigationType: RouterTransitionType,
    event: RouterTransitionStartEvent | null
  ) => void
  unstable_onRouterTransitionCommit?: (
    url: string,
    navigationType: RouterTransitionType,
    event: RouterTransitionCommitEvent
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
