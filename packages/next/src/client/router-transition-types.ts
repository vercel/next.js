export type RouterTransitionType = 'push' | 'replace' | 'traverse'

export type RouterTransitionPrefetchIntent = 'full' | 'auto' | 'none'

export type RouterTransitionEvent = {
  id: string
  timestamp: number
}

/**
 * One rendered route of a transition: a route template plus the dynamic param
 * values that fill its holes. Scoping the params to the template (rather than
 * pooling them per event) makes the join unambiguous — `params[i]` always
 * fills `:(i+1)` of *this* template — even when parallel-route slots render
 * sibling templates whose holes share the same positional labels.
 */
export type RouterTransitionMatchedRoute = {
  /**
   * The route template path, with parallel-route slots included (as `@slot`).
   * Dynamic segments are positional holes (`:1`, `:2`, ...) rather than param
   * names, so renaming a `[param]` folder does not break log continuity.
   *
   * Hole numbering is per-template: `:n` is the n-th dynamic segment along
   * this template's own path, independent of sibling templates. That keeps
   * template strings — the values consumers group logs by — stable when an
   * unrelated sibling route gains or loses a dynamic segment. Best-effort:
   * the `app/` root and `page`/`layout` suffix are not reconstructable on
   * the client.
   *
   * Examples: `/blog/hello` rendered by `app/blog/[slug]/page.tsx` reports
   * `"/blog/:1"`; a photo modal intercepted over a gallery reports
   * `"/gallery/@modal/(.)photos/:1"`; a route group folder like `(marketing)`
   * never appears.
   */
  template: string
  /**
   * The dynamic param values for this template, positional by hole order:
   * `params[i]` fills this template's `:(i+1)` hole. Values are NOT keyed by
   * param name, which is folder-derived and not rename-stable. A catch-all
   * value is the array of its path segments.
   *
   * A hole on a path prefix shared with sibling templates repeats its value
   * in each sibling's `params`, so every entry of `routes` is joinable on
   * its own.
   *
   * Examples: `{ template: "/blog/:1", params: ["hello"] }`; `/docs/a/b`
   * under `app/docs/[...parts]` reports
   * `{ template: "/docs/:1", params: [["a", "b"]] }`.
   */
  params: Array<string | string[]>
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
   * template with the param values that fill that template's own holes; see
   * `RouterTransitionMatchedRoute` for the join rule.
   *
   * Examples: `/blog/hello` rendered by `app/blog/[slug]/page.tsx` reports
   * `[{ template: "/blog/:1", params: ["hello"] }]`; a photo modal
   * intercepted over a gallery reports
   * `[{ template: "/gallery", params: [] },
   *   { template: "/gallery/@modal/(.)photos/:1", params: ["1"] }]`.
   */
  routes: RouterTransitionMatchedRoute[]
  /**
   * The post-rewrite search params (from the server-observed
   * `renderedSearch`), so a search param added or changed by a middleware
   * rewrite is reflected here. Unlike route param names, search param keys
   * are reported verbatim — they are already user-visible in the address bar.
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
   * was computed against. When rapid successive navigations replace each
   * other, this is the destination of the latest dispatched navigation even
   * if that navigation never visually committed. Example: on `/`, the user
   * clicks a link to `/a` and then a link to `/b` before `/a` finishes —
   * `/b`'s start reports `from: /a` even though the user never saw `/a`
   * (its abort event is what signals the gap to consumers joining commits
   * to subsequent starts).
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
