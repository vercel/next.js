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
  // TODO(cache-stages): docs link
  return new Error(
    `Route "${route}": Next.js encountered \`navigation()\` during prerendering or a navigation.\n\n` +
      `\`navigation()\` called outside of \`<Suspense>\` may prevent the navigation from being instant, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access\n` +
      `  - [block] Set \`export const instant = false\` to allow a blocking route\n\n` +
      `Learn more: https://nextjs.org/docs/messages/instant-shell-url-data`
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
  // TODO(cache-stages): docs link
  return new Error(
    `Route "${route}": Next.js encountered \`navigation()\` in \`generateMetadata()\`.\n\n` +
      `This route's metadata is blocked, but the rest of its content can be prefetched. \`navigation()\` called in \`generateMetadata()\` prevents it from being prefetched.\n\n` +
      `Ways to fix this:\n` +
      `  - [static] Use a static metadata export instead of \`generateMetadata()\`\n` +
      `  - [dynamic] Render a marker component that calls \`await connection()\` inside \`<Suspense>\` on the page\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime`
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
  // TODO(cache-stages): docs link
  return new Error(
    `Route "${route}": Next.js encountered \`navigation()\` in \`generateViewport()\`.\n\n` +
      `\`navigation()\` in \`generateViewport()\` prevents creating a shell, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [static] Use a static viewport export instead of \`generateViewport()\`\n` +
      `  - [block] Set \`export const instant = false\` to allow a blocking route\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime`
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
      `This route is configured to be fully static, but runtime data from \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or a short-lived cache prevents it from being prerendered.\n\n` +
      `Ways to fix this:\n` +
      `  - [static] Replace the runtime data with static data\n` +
      `  - For \`params\`: specify a static set of params to prerender with \`generateStaticParams()\`\n` +
      `  - For \`searchParams\`: read them on the client with \`useSearchParams()\`\n` +
      `  - [remove] Remove \`unstable_ensureStatic = "navigation"\` from the page or layout that requires fully static output\n\n` +
      `Learn more: https://nextjs.org/docs/messages/ensure-static-route`
  )
}

export function createDynamicBodyErrorInStaticRoute(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached data on a route that must be fully static.\n\n` +
      `This route is configured to be fully static, but an uncached \`fetch(...)\`, database call, or \`connection()\` prevents it from being prerendered.\n\n` +
      `Ways to fix this:\n` +
      `  - [cache] Cache the data access with \`"use cache"\` (does not apply to \`connection()\`)\n` +
      `  - [static] Replace the dynamic data access with static data\n` +
      `  - [remove] Remove \`unstable_ensureStatic = "navigation"\` from the page or layout that requires fully static output\n\n` +
      `Learn more: https://nextjs.org/docs/messages/ensure-static-route`
  )
}

export function createNonPrerenderableBodyErrorInStaticRoute(
  route: string
): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached or runtime data on a route that must be fully static.\n\n` +
      `This route is configured to be fully static, but uncached or runtime data from \`fetch(...)\`, database calls, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, \`connection()\`, or a short-lived cache prevents it from being prerendered.\n\n` +
      `Ways to fix this:\n` +
      `  - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\` (does not apply to \`connection()\`)\n` +
      `  - [static] Replace the dynamic data access with static data\n` +
      `  - For \`params\`: specify a static set of params to prerender with \`generateStaticParams()\`\n` +
      `  - For \`searchParams\`: read them on the client with \`useSearchParams()\`\n` +
      `  - [remove] Remove \`unstable_ensureStatic = "navigation"\` from the page or layout that requires fully static output\n\n` +
      `Learn more: https://nextjs.org/docs/messages/ensure-static-route`
  )
}

export function createRuntimeMetadataErrorInStaticRoute(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered runtime data in \`generateMetadata()\` on a route that must be fully static.\n\n` +
      `This route is configured to be fully static, but runtime data from \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or a short-lived cache prevents \`generateMetadata()\` from being prerendered.\n\n` +
      `Ways to fix this:\n` +
      `  - [static] Replace the dynamic data used by \`generateMetadata()\` with static data\n` +
      `  - For \`params\`: specify a static set of params to prerender with \`generateStaticParams()\`\n` +
      `  - [remove] Remove \`unstable_ensureStatic = "navigation"\` from the page or layout that requires fully static output\n\n` +
      `Learn more: https://nextjs.org/docs/messages/ensure-static-metadata`
  )
}

export function createDynamicMetadataErrorInStaticRoute(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached data in \`generateMetadata()\` on a route that must be fully static.\n\n` +
      `This route is configured to be fully static, but an uncached \`fetch(...)\`, database call, or \`connection()\` prevents \`generateMetadata()\` from being prerendered.\n\n` +
      `Ways to fix this:\n` +
      `  - [cache] Cache the data used by \`generateMetadata()\` with \`"use cache"\` (does not apply to \`connection()\`)\n` +
      `  - [static] Replace the dynamic data used by \`generateMetadata()\` with static data\n` +
      `  - [remove] Remove \`unstable_ensureStatic = "navigation"\` from the page or layout that requires fully static output\n\n` +
      `Learn more: https://nextjs.org/docs/messages/ensure-static-metadata`
  )
}

export function createNonPrerenderableMetadataErrorInStaticRoute(
  route: string
): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached or runtime data in \`generateMetadata()\` on a route that must be fully static.\n\n` +
      `This route is configured to be fully static, but uncached or runtime data from \`fetch(...)\`, database calls, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, \`connection()\`, or a short-lived cache prevents \`generateMetadata()\` from being prerendered.\n\n` +
      `Ways to fix this:\n` +
      `  - [cache] For uncached data: cache the data used by \`generateMetadata()\` with \`"use cache"\` (does not apply to \`connection()\`)\n` +
      `  - [static] Replace the dynamic data used by \`generateMetadata()\` with static data\n` +
      `  - For \`params\`: specify a static set of params to prerender with \`generateStaticParams()\`\n` +
      `  - [remove] Remove \`unstable_ensureStatic = "navigation"\` from the page or layout that requires fully static output\n\n` +
      `Learn more: https://nextjs.org/docs/messages/ensure-static-metadata`
  )
}

export function createRuntimeViewportErrorInStaticRoute(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered runtime data in \`generateViewport()\` on a route that must be fully static.\n\n` +
      `This route is configured to be fully static, but runtime data from \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or a short-lived cache prevents \`generateViewport()\` from being prerendered.\n\n` +
      `Ways to fix this:\n` +
      `  - [static] Replace the dynamic data used by \`generateViewport()\` with static data\n` +
      `  - For \`params\`: specify a static set of params to prerender with \`generateStaticParams()\`\n` +
      `  - [remove] Remove \`unstable_ensureStatic = "navigation"\` from the page or layout that requires fully static output\n\n` +
      `Learn more: https://nextjs.org/docs/messages/ensure-static-viewport`
  )
}

export function createDynamicViewportErrorInStaticRoute(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached data in \`generateViewport()\` on a route that must be fully static.\n\n` +
      `This route is configured to be fully static, but an uncached \`fetch(...)\`, database call, or \`connection()\` prevents \`generateViewport()\` from being prerendered.\n\n` +
      `Ways to fix this:\n` +
      `  - [cache] Cache the data used by \`generateViewport()\` with \`"use cache"\` (does not apply to \`connection()\`)\n` +
      `  - [static] Replace the dynamic data used by \`generateViewport()\` with static data\n` +
      `  - [remove] Remove \`unstable_ensureStatic = "navigation"\` from the page or layout that requires fully static output\n\n` +
      `Learn more: https://nextjs.org/docs/messages/ensure-static-viewport`
  )
}

export function createNonPrerenderableViewportErrorInStaticRoute(
  route: string
): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached or runtime data in \`generateViewport()\` on a route that must be fully static.\n\n` +
      `This route is configured to be fully static, but uncached or runtime data from \`fetch(...)\`, database calls, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, \`connection()\`, or a short-lived cache prevents \`generateViewport()\` from being prerendered.\n\n` +
      `Ways to fix this:\n` +
      `  - [cache] For uncached data: cache the data used by \`generateViewport()\` with \`"use cache"\` (does not apply to \`connection()\`)\n` +
      `  - [static] Replace the dynamic data used by \`generateViewport()\` with static data\n` +
      `  - For \`params\`: specify a static set of params to prerender with \`generateStaticParams()\`\n` +
      `  - [remove] Remove \`unstable_ensureStatic = "navigation"\` from the page or layout that requires fully static output\n\n` +
      `Learn more: https://nextjs.org/docs/messages/ensure-static-viewport`
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
