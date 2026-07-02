export type RouterTransitionType = 'push' | 'replace' | 'traverse'

export type RouterTransitionPrefetchIntent = 'full' | 'auto' | 'none'

export type RouterTransitionEvent = {
  id: string
  timestamp: number
}

/**
 * Emitted when a navigation is dispatched. The `from*` fields describe the
 * route the navigation started from; they mirror the `to*` fields on the
 * commit event, so consumers can join/group across events (e.g. a hash-only
 * navigation has `from*` fields deep-equal to the commit's `to*` fields).
 */
export type RouterTransitionStartEvent = RouterTransitionEvent & {
  /**
   * The server's post-rewrite pathname (the route that actually rendered),
   * reconstructed from the concrete route tree. May differ from
   * `fromCanonicalUrl` when a rewrite/intercept occurred.
   *
   * Example: with a middleware rewrite from `/old-blog/hello` to
   * `/blog/hello`, this is `"/blog/hello"` while `fromCanonicalUrl` is
   * `"/old-blog/hello"`. For an intercepted photo modal over a gallery, this
   * is `"/gallery"` (the primary rendered route) while `fromCanonicalUrl` is
   * `"/gallery/photos/1"`.
   */
  fromRenderedPathname: string
  /**
   * The pre-rewrite URL shown in the browser address bar.
   *
   * Example: `"/old-blog/hello?q=1"` — even when a middleware rewrite meant
   * the server actually rendered `/blog/hello`.
   */
  fromCanonicalUrl: string
  /**
   * Route template paths, deepest (leaf/page) first, with parallel-route slots
   * included (as `@slot`). Dynamic segments are positional holes (`:1`, `:2`,
   * ...) rather than param names, so renaming a `[param]` folder does not break
   * log continuity. Best-effort: the `app/` root and `page`/`layout` suffix are
   * not reconstructable on the client.
   *
   * Examples: `/blog/hello` rendered by `app/blog/[slug]/page.tsx` reports
   * `["/blog/:1"]`; a photo modal intercepted over a gallery reports
   * `["/gallery", "/gallery/@modal/(.)photos/:1"]`; a route group folder like
   * `(marketing)` never appears.
   */
  fromRouteTemplates: string[]
  /**
   * Dynamic param values, positional by hole order (NOT keyed by param name,
   * which is folder-derived and not rename-stable). A catch-all value is the
   * array of its path segments.
   *
   * Examples: `/blog/hello` under `app/blog/[slug]` reports `["hello"]` (the
   * value of the `:1` hole); `/docs/a/b` under `app/docs/[...parts]` reports
   * `[["a", "b"]]`.
   */
  fromParams: Array<string | string[]>
  /**
   * The post-rewrite search params (from the server-observed
   * `renderedSearch`), so a search param added or changed by a middleware
   * rewrite is reflected here. Unlike route param names, search param keys
   * are reported verbatim — they are already user-visible in the address bar.
   *
   * Example: `?q=shoes&color=red&color=blue` reports
   * `{ q: "shoes", color: ["red", "blue"] }`.
   */
  fromSearchParams: Record<string, string | string[]>
}

/**
 * Emitted when the navigation is applied to the browser. The `to*` fields
 * describe the route that was committed, in the same shape as the start
 * event's `from*` fields.
 */
export type RouterTransitionCommitEvent = RouterTransitionEvent & {
  /**
   * The server's post-rewrite pathname (the route that actually rendered),
   * reconstructed from the concrete route tree. May differ from
   * `toCanonicalUrl` when a rewrite/intercept occurred.
   *
   * Example: navigating to `/old-blog/hello` with a middleware rewrite to
   * `/blog/hello` commits with `toCanonicalUrl: "/old-blog/hello"` (what the
   * address bar shows) and `toRenderedPathname: "/blog/hello"` (what
   * rendered).
   */
  toRenderedPathname: string
  /**
   * The pre-rewrite URL shown in the browser address bar.
   *
   * Example: `"/old-blog/hello?q=1"` — even when a middleware rewrite meant
   * the server actually rendered `/blog/hello`.
   */
  toCanonicalUrl: string
  /**
   * Route template paths, deepest (leaf/page) first, with parallel-route slots
   * included (as `@slot`). Dynamic segments are positional holes (`:1`, `:2`,
   * ...) rather than param names, so renaming a `[param]` folder does not
   * break log continuity.
   *
   * Examples: `/blog/hello` rendered by `app/blog/[slug]/page.tsx` reports
   * `["/blog/:1"]`; a photo modal intercepted over a gallery reports
   * `["/gallery", "/gallery/@modal/(.)photos/:1"]`.
   */
  toRouteTemplates: string[]
  /**
   * Dynamic param values, positional by hole order. A catch-all value is the
   * array of its path segments.
   *
   * Examples: `/blog/hello` under `app/blog/[slug]` reports `["hello"]`;
   * `/docs/a/b` under `app/docs/[...parts]` reports `[["a", "b"]]`.
   */
  toParams: Array<string | string[]>
  /**
   * The post-rewrite search params (from the server-observed
   * `renderedSearch`), so a search param added or changed by a middleware
   * rewrite is reflected here. Unlike route param names, search param keys
   * are reported verbatim — they are already user-visible in the address bar.
   *
   * Example: `?q=shoes&color=red&color=blue` reports
   * `{ q: "shoes", color: ["red", "blue"] }`.
   */
  toSearchParams: Record<string, string | string[]>
  /**
   * Whether the router had cached UI for the destination page that it could —
   * and did — navigate into immediately. `'hit'` means the user saw cached
   * content (a prefetched shell, BFCache content, or already-streamed dynamic
   * data) the moment the navigation committed; `'miss'` means every page
   * segment had to wait on the server, so the user saw a loading fallback
   * first. The head is excluded from this determination because it streams in
   * non-blocking.
   */
  cache: 'hit' | 'miss'
}

export type RouterTransitionAbortEvent = RouterTransitionEvent & {
  /**
   * The id of the transition whose commit superseded (and thereby aborted)
   * this one. A transition is aborted only by being superseded: a newer
   * navigation committed before this one could.
   */
  supersededByTransitionId: string
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
