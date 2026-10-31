export function createRuntimeBodyError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered runtime data during prerendering.\n\n` +
      `\`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access\n` +
      `  - [block] Set \`export const instant = false\` to allow a blocking route\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-prerender-runtime`
  )
}

export function createDynamicBodyError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached data during prerendering.\n\n` +
      `\`fetch(...)\` or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access\n` +
      `  - [cache] Cache the data access with \`"use cache"\` (does not apply to \`connection()\`)\n` +
      `  - [block] Set \`export const instant = false\` to allow a blocking route\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-prerender-dynamic`
  )
}

export function createRuntimeBodyErrorInNavigation(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered runtime data during prerendering or a navigation.\n\n` +
      `\`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access\n` +
      `  - [block] Set \`export const instant = false\` to allow a blocking route\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-prerender-runtime`
  )
}

export function createLinkBodyErrorInNavigation(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered URL data during prerendering or a navigation.\n\n` +
      `\`params\` or \`searchParams\` accessed outside of \`<Suspense>\` may prevent the navigation from being instant, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access\n` +
      `  - [block] Set \`export const instant = false\` to allow a blocking route\n\n` +
      `Learn more: https://nextjs.org/docs/messages/instant-shell-url-data`
  )
}

export function createNavigationBodyErrorInNavigation(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered \`navigation()\` during prerendering or a navigation.\n\n` +
      `\`navigation()\` called outside of \`<Suspense>\` may prevent the navigation from being instant, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the component that calls \`navigation()\`\n` +
      `  - [block] Set \`export const instant = false\` to allow a blocking route\n\n` +
      `Learn more: https://nextjs.org/docs/messages/instant-navigation-stage`
  )
}

export function createPrefetchBodyErrorInNavigation(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered \`prefetch()\` during prerendering or a navigation.\n\n` +
      `\`prefetch()\` called outside of \`<Suspense>\` may prevent the navigation from being instant, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the component that calls \`prefetch()\`\n` +
      `  - [block] Set \`export const instant = false\` to allow a blocking route\n\n` +
      `Learn more: https://nextjs.org/docs/messages/instant-navigation-stage`
  )
}

export function createDynamicBodyErrorInNavigation(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached data during prerendering or a navigation.\n\n` +
      `\`fetch(...)\` or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access\n` +
      `  - [cache] Cache the data access with \`"use cache"\` (does not apply to \`connection()\`)\n` +
      `  - [block] Set \`export const instant = false\` to allow a blocking route\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-prerender-dynamic`
  )
}

/**
 * NOTE: Prefer `createRuntimeBodyError` or `createDynamicBodyError`.
 * Only use this in situations like build-time static validation, where
 * we can't pinpoint a more specific reason.
 */
export function createDynamicOrRuntimeBodyError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached or runtime data during prerendering.\n\n` +
      `\`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access\n` +
      `  - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)\n` +
      `  - [block] Set \`export const instant = false\` to allow a blocking route\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-prerender-dynamic`
  )
}

export function createLinkMetadataError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered URL data in \`generateMetadata()\`.\n\n` +
      `This route's metadata is blocked, but the rest of its content can be prefetched. \`params\` or \`searchParams\` accessed in \`generateMetadata()\` prevent it from being prefetched.\n\n` +
      `Ways to fix this:\n` +
      `  - [static] Use a static metadata export instead of \`generateMetadata()\`\n` +
      `  - [dynamic] Render a marker component that calls \`await connection()\` inside \`<Suspense>\` on the page\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime`
  )
}

export function createRuntimeMetadataError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered runtime data in \`generateMetadata()\`.\n\n` +
      `This route's metadata is blocked, but the rest of its content can be prerendered. \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed in \`generateMetadata()\` cause it to run dynamically.\n\n` +
      `Ways to fix this:\n` +
      `  - [static] Use a static metadata export instead of \`generateMetadata()\`\n` +
      `  - [dynamic] Render a marker component that calls \`await connection()\` inside \`<Suspense>\` on the page\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime`
  )
}

export function createNavigationMetadataError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered \`navigation()\` in \`generateMetadata()\`.\n\n` +
      `Metadata can already stream without blocking the route's UI, so delaying it until navigation may be unintentional.\n\n` +
      `Ways to fix this:\n` +
      `  - [remove] Remove \`navigation()\` from \`generateMetadata()\`\n` +
      `  - [mark] Render a marker component that calls \`await navigation()\` inside \`<Suspense>\` on the page\n\n` +
      `Learn more: https://nextjs.org/docs/messages/instant-navigation-stage-metadata`
  )
}

export function createPrefetchMetadataError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered \`prefetch()\` in \`generateMetadata()\`.\n\n` +
      `Metadata can already stream without blocking the route's UI, so delaying it until a per-link prefetch or navigation may be unintentional.\n\n` +
      `Ways to fix this:\n` +
      `  - [remove] Remove \`prefetch()\` from \`generateMetadata()\`\n` +
      `  - [mark] Render a marker component that calls \`await prefetch()\` inside \`<Suspense>\` on the page\n\n` +
      `Learn more: https://nextjs.org/docs/messages/instant-navigation-stage-metadata`
  )
}

export function createDynamicMetadataError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached data in \`generateMetadata()\`.\n\n` +
      `This route's metadata is blocked, but the rest of its content can be prerendered. \`fetch(...)\` or \`connection()\` accessed in \`generateMetadata()\` cause it to run dynamically.\n\n` +
      `Ways to fix this:\n` +
      `  - [cache] Cache the metadata with \`"use cache"\` in \`generateMetadata()\` (does not apply to \`connection()\`)\n` +
      `  - [dynamic] Render a marker component that calls \`await connection()\` inside \`<Suspense>\` on the page\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic`
  )
}

export function createLinkViewportError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered URL data in \`generateViewport()\`.\n\n` +
      `\`params\` or \`searchParams\` in \`generateViewport()\` prevents the page from being prerendered, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [static] Use a static viewport export instead of \`generateViewport()\`\n` +
      `  - [block] Set \`export const instant = false\` to allow a blocking route\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime`
  )
}

export function createRuntimeViewportError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered runtime data in \`generateViewport()\`.\n\n` +
      `\`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` in \`generateViewport()\` prevents the page from being prerendered, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [static] Use a static viewport export instead of \`generateViewport()\`\n` +
      `  - [block] Set \`export const instant = false\` to allow a blocking route\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime`
  )
}

export function createNavigationViewportError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered \`navigation()\` in \`generateViewport()\`.\n\n` +
      `This prevents Next.js from creating the App Shell, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [remove] Remove \`navigation()\` from \`generateViewport()\`\n` +
      `  - [ignore] Set \`export const instant = false\` to disable validation for this segment\n\n` +
      `Learn more: https://nextjs.org/docs/messages/instant-navigation-stage-viewport`
  )
}

export function createPrefetchViewportError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered \`prefetch()\` in \`generateViewport()\`.\n\n` +
      `This prevents Next.js from creating the App Shell, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [remove] Remove \`prefetch()\` from \`generateViewport()\`\n` +
      `  - [ignore] Set \`export const instant = false\` to disable validation for this segment\n\n` +
      `Learn more: https://nextjs.org/docs/messages/instant-navigation-stage-viewport`
  )
}

export function createDynamicViewportError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached data in \`generateViewport()\`.\n\n` +
      `\`fetch(...)\` or \`connection()\` in \`generateViewport()\` prevents the page from being prerendered, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [cache] Cache the viewport data with \`"use cache"\` in \`generateViewport()\` (does not apply to \`connection()\`)\n` +
      `  - [block] Set \`export const instant = false\` to allow a blocking route\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic`
  )
}

/**
 * NOTE: Prefer `createRuntimeViewportError` or `createDynamicViewportError`.
 * Only use this in situations like build-time static validation, where
 * we can't pinpoint a more specific reason.
 */
export function createDynamicOrRuntimeViewportError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached or runtime data in \`generateViewport()\`.\n\n` +
      `This prevents the page from being prerendered, leading to a slower user experience. Unlike metadata, viewport cannot be streamed behind \`<Suspense>\` because it affects the initial page load.\n\n` +
      `Ways to fix this:\n` +
      `  - [static] Use a static viewport export instead of \`generateViewport()\`\n` +
      `  - [cache] For uncached data (\`fetch\`, database calls): cache the viewport with \`"use cache"\` in \`generateViewport()\` (does not apply to \`connection()\`)\n` +
      `  - [block] Set \`export const instant = false\` to allow a blocking route\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime`
  )
}

/**
 * NOTE: Prefer `createRuntimeMetadataError` or `createDynamicMetadataError`.
 * Only use this in situations like build-time static validation, where
 * we can't pinpoint a more specific reason.
 */
export function createDynamicOrRuntimeMetadataError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached or runtime data in \`generateMetadata()\`.\n\n` +
      `This route's metadata is blocked, but the rest of its content can be prerendered.\n\n` +
      `Ways to fix this:\n` +
      `  - [static] Use a static metadata export instead of \`generateMetadata()\`\n` +
      `  - [cache] Cache the metadata with \`"use cache"\` in \`generateMetadata()\` (does not apply to \`connection()\`)\n` +
      `  - [dynamic] Render a marker component that calls \`await connection()\` inside \`<Suspense>\` on the page\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime`
  )
}

//====================================================
// Static routes (with `ensureStatic = "navigation"`)
//====================================================

export function createRuntimeBodyErrorInStaticRoute(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered runtime data on a route that must be fully static.\n\n` +
      `This route is configured to be fully static, but runtime data from \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or a short-lived cache requires rendering at request time.\n\n` +
      `Ways to fix this:\n` +
      `  - [remove] Remove the data access\n` +
      `  - [client] Read the data on the client\n\n` +
      `Learn more: https://nextjs.org/docs/messages/static-route-runtime`
  )
}

export function createDynamicBodyErrorInStaticRoute(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached data on a route that must be fully static.\n\n` +
      `This route is configured to be fully static, but an uncached \`fetch(...)\`, database call, or \`connection()\` requires rendering at request time.\n\n` +
      `Ways to fix this:\n` +
      `  - [cache] Cache the data access with \`"use cache"\` (does not apply to \`connection()\`)\n` +
      `  - [remove] Remove the data access\n` +
      `  - [client] Read the data on the client\n\n` +
      `Learn more: https://nextjs.org/docs/messages/static-route-dynamic`
  )
}

export function createNonPrerenderableBodyErrorInStaticRoute(
  route: string
): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached or runtime data on a route that must be fully static.\n\n` +
      `This route is configured to be fully static, but some data requires rendering at request time.\n\n` +
      `Ways to fix this:\n` +
      `  - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)\n` +
      `  - [remove] Remove the data access\n` +
      `  - [client] Read the data on the client\n\n` +
      `Learn more: https://nextjs.org/docs/messages/static-route-dynamic`
  )
}

export function createRuntimeMetadataErrorInStaticRoute(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered runtime data in \`generateMetadata()\` on a route that must be fully static.\n\n` +
      `This route is configured to be fully static, but runtime data from \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or a short-lived cache requires rendering at request time.\n\n` +
      `Ways to fix this:\n` +
      `  - [static] Replace the dynamic data used by \`generateMetadata()\` with static data\n\n` +
      `Learn more: https://nextjs.org/docs/messages/static-metadata-runtime`
  )
}

export function createDynamicMetadataErrorInStaticRoute(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached data in \`generateMetadata()\` on a route that must be fully static.\n\n` +
      `This route is configured to be fully static, but an uncached \`fetch(...)\`, database call, or \`connection()\` requires rendering at request time.\n\n` +
      `Ways to fix this:\n` +
      `  - [cache] Cache the data used by \`generateMetadata()\` with \`"use cache"\` (does not apply to \`connection()\`)\n` +
      `  - [static] Replace the dynamic data used by \`generateMetadata()\` with static data\n\n` +
      `Learn more: https://nextjs.org/docs/messages/static-metadata-dynamic`
  )
}

export function createNonPrerenderableMetadataErrorInStaticRoute(
  route: string
): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached or runtime data in \`generateMetadata()\` on a route that must be fully static.\n\n` +
      `This route is configured to be fully static, but some data requires rendering at request time.\n\n` +
      `Ways to fix this:\n` +
      `  - [cache] For uncached data: cache the data used by \`generateMetadata()\` with \`"use cache"\` (does not apply to \`connection()\`)\n` +
      `  - [static] Replace the dynamic data used by \`generateMetadata()\` with static data\n\n` +
      `Learn more: https://nextjs.org/docs/messages/static-metadata-dynamic`
  )
}

export function createRuntimeViewportErrorInStaticRoute(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered runtime data in \`generateViewport()\` on a route that must be fully static.\n\n` +
      `This route is configured to be fully static, but runtime data from \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or a short-lived cache requires rendering at request time.\n\n` +
      `Ways to fix this:\n` +
      `  - [static] Replace the dynamic data used by \`generateViewport()\` with static data\n\n` +
      `Learn more: https://nextjs.org/docs/messages/static-viewport-runtime`
  )
}

export function createDynamicViewportErrorInStaticRoute(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached data in \`generateViewport()\` on a route that must be fully static.\n\n` +
      `This route is configured to be fully static, but an uncached \`fetch(...)\`, database call, or \`connection()\` requires rendering at request time.\n\n` +
      `Ways to fix this:\n` +
      `  - [cache] Cache the data used by \`generateViewport()\` with \`"use cache"\` (does not apply to \`connection()\`)\n` +
      `  - [static] Replace the dynamic data used by \`generateViewport()\` with static data\n\n` +
      `Learn more: https://nextjs.org/docs/messages/static-viewport-dynamic`
  )
}

export function createNonPrerenderableViewportErrorInStaticRoute(
  route: string
): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached or runtime data in \`generateViewport()\` on a route that must be fully static.\n\n` +
      `This route is configured to be fully static, but some data requires rendering at request time.\n\n` +
      `Ways to fix this:\n` +
      `  - [cache] For uncached data: cache the data used by \`generateViewport()\` with \`"use cache"\` (does not apply to \`connection()\`)\n` +
      `  - [static] Replace the dynamic data used by \`generateViewport()\` with static data\n\n` +
      `Learn more: https://nextjs.org/docs/messages/static-viewport-dynamic`
  )
}

export function logBuildDebugHint(route: string): void {
  if (process.env.NODE_ENV !== 'development') {
    console.error(
      `To get a more detailed stack trace and pinpoint the issue, try one of the following:\n` +
        `  - Start the app in development mode by running \`next dev\`, then open "${route}" in your browser to investigate the error.\n` +
        `  - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.`
    )
  } else if (!process.env.__NEXT_DEV_SERVER) {
    console.error(
      `To debug the issue, start the app in development mode by running \`next dev\`, then open "${route}" in your browser to investigate the error.`
    )
  }
}
