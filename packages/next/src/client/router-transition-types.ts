export type RouterTransitionType = 'push' | 'replace' | 'traverse'

export type RouterTransitionEvent = {
  id: string
  timestamp: number
}

/**
 * One rendered route of a transition: a route template plus the dynamic param
 * values that fill it. Params are scoped to the template (rather than pooled
 * per event) so parallel-route slots that bind the same param name stay
 * unambiguous, and every entry of `routes` is joinable on its own.
 */
export type RouterTransitionMatchedRoute = {
  /**
   * The route template path, with parallel-route slots included (as `@slot`)
   * and dynamic segments in their source notation (`[slug]`, `[...parts]`,
   * `[[...parts]]`). Param names are reported verbatim, so renaming a
   * `[param]` folder changes the template. Best-effort: the `app/` root and
   * `page`/`layout` suffix are not reconstructable on the client.
   *
   * Examples: `/blog/hello` rendered by `app/blog/[slug]/page.tsx` reports
   * `"/blog/[slug]"`; a photo modal intercepted over a gallery reports
   * `"/gallery/@modal/(.)photos/[id]"`; a route group folder like
   * `(marketing)` never appears.
   */
  template: string
  /**
   * The dynamic param values for this template, keyed by param name. A
   * catch-all value is the array of its path segments. A param on a path
   * prefix shared with sibling templates repeats in each sibling's `params`.
   *
   * Examples: `{ template: "/blog/[slug]", params: { slug: "hello" } }`;
   * `/docs/a/b` under `app/docs/[...parts]` reports
   * `{ template: "/docs/[...parts]", params: { parts: ["a", "b"] } }`.
   */
  params: Record<string, string | string[]>
}

/**
 * Describes the route on one side of a transition: the route the navigation
 * left (`from` on the start event) or the route that was committed (`to` on
 * the commit event). Both sides share this shape so consumers can join/group
 * across events (e.g. a hash-only navigation has a `from` deep-equal to the
 * commit's `to`).
 */
export type RouterTransitionRoute = {
  /**
   * The server's post-rewrite pathname (the route that actually rendered),
   * reconstructed from the concrete route tree. May differ from
   * `canonicalUrl` when a rewrite/intercept occurred.
   *
   * Example: with a middleware rewrite from `/old-blog/hello` to
   * `/blog/hello`, this is `"/blog/hello"` while `canonicalUrl` is
   * `"/old-blog/hello"`. For an intercepted photo modal over a gallery, this
   * is `"/gallery"` (the primary rendered route) while `canonicalUrl` is
   * `"/gallery/photos/1"`.
   */
  renderedPathname: string
  /**
   * The pre-rewrite URL shown in the browser address bar.
   *
   * Example: `"/old-blog/hello?q=1"` — even when a middleware rewrite meant
   * the server actually rendered `/blog/hello`.
   */
  canonicalUrl: string
  /**
   * The rendered routes, primary (leaf/page) first, then parallel-route slot
   * templates in stable (alphabetical) order. Each entry pairs a route
   * template with the param values that fill it; see
   * `RouterTransitionMatchedRoute`.
   *
   * Examples: `/blog/hello` rendered by `app/blog/[slug]/page.tsx` reports
   * `[{ template: "/blog/[slug]", params: { slug: "hello" } }]`; a photo
   * modal intercepted over a gallery reports
   * `[{ template: "/gallery", params: {} },
   *   { template: "/gallery/@modal/(.)photos/[id]", params: { id: "1" } }]`.
   */
  routes: RouterTransitionMatchedRoute[]
  /**
   * The post-rewrite search params (from the server-observed
   * `renderedSearch`), so a search param added or changed by a middleware
   * rewrite is reflected here.
   *
   * Example: `?q=shoes&color=red&color=blue` reports
   * `{ q: "shoes", color: ["red", "blue"] }`.
   */
  searchParams: Record<string, string | string[]>
}

/**
 * Emitted when a navigation is dispatched.
 */
export type RouterTransitionStartEvent = RouterTransitionEvent & {
  /**
   * The route the navigation started from: the router state this navigation
   * was computed against. During rapid successive navigations this is the
   * latest state the router had produced when this navigation was dispatched,
   * which is not necessarily what the user saw — and not necessarily the
   * previous navigation's destination either. Example: on `/`, the user
   * clicks a link to `/a` and then a link to `/b` before `/a` visually
   * commits. If `/a` had already produced its destination state (it was
   * prefetched), `/b`'s start reports `from: /a` even though the user never
   * saw `/a`; if `/a` was still waiting on the server, `/b`'s start reports
   * `from: /`. The abort events are what signal these gaps to consumers
   * joining commits to subsequent starts.
   */
  from: RouterTransitionRoute
}

/**
 * Emitted when the navigation is applied to the browser.
 */
export type RouterTransitionCommitEvent = RouterTransitionEvent & {
  /** The route that was committed. */
  to: RouterTransitionRoute
}

export type RouterTransitionAbortEvent = RouterTransitionEvent & {
  /**
   * The id of the transition whose commit replaced (and thereby aborted)
   * this one. A transition is aborted only by being replaced: a newer
   * navigation committed before this one could.
   */
  replacedBy: string
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
