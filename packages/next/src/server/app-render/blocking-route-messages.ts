export function createRuntimeBodyError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered runtime data during prerendering.\n\n` +
      `\`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense\n` +
      `  - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender\n` +
      `  - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route`
  )
}

export function createDynamicBodyError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached data during prerendering.\n\n` +
      `\`fetch(...)\` or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense\n` +
      `  - [cache] Cache the data access with \`"use cache"\`\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data\n` +
      `  - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route`
  )
}

export function createRuntimeBodyErrorInNavigation(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered runtime data during prerendering or a navigation.\n\n` +
      `\`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-runtime#wrap-in-or-move-into-suspense\n` +
      `  - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender\n` +
      `  - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-runtime#allow-blocking-route`
  )
}

export function createDynamicBodyErrorInNavigation(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached data during prerendering or a navigation.\n\n` +
      `\`fetch(...)\` or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [stream] Provide a placeholder with \`<Suspense fallback={...}>\` around the data access\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense\n` +
      `  - [cache] Cache the data access with \`"use cache"\`\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data\n` +
      `  - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route`
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
      `    https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense\n` +
      `  - [cache] For uncached data (\`fetch\`, database calls): cache the access with \`"use cache"\`\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data\n` +
      `  - [cache] For \`params\`: if the params are known, prerender them with \`generateStaticParams\`\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-runtime#for-known-params-prerender\n` +
      `  - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route`
  )
}

export function createRuntimeMetadataError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered runtime data in \`generateMetadata()\`.\n\n` +
      `This route's metadata is blocked, but the rest of its content can be prerendered. \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed in \`generateMetadata()\` cause it to run dynamically.\n\n` +
      `Ways to fix this:\n` +
      `  - [static] Use a static metadata export instead of \`generateMetadata()\`\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime#use-static-metadata\n` +
      `  - [dynamic] Render a marker component that calls \`await connection()\` inside \`<Suspense>\` on the page\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime#mark-the-route-as-dynamic`
  )
}

export function createDynamicMetadataError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached data in \`generateMetadata()\`.\n\n` +
      `This route's metadata is blocked, but the rest of its content can be prerendered. \`fetch(...)\` or \`connection()\` accessed in \`generateMetadata()\` cause it to run dynamically.\n\n` +
      `Ways to fix this:\n` +
      `  - [cache] Cache the metadata with \`"use cache"\` in \`generateMetadata()\`\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#cache-the-metadata\n` +
      `  - [dynamic] Render a marker component that calls \`await connection()\` inside \`<Suspense>\` on the page\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#mark-the-route-as-dynamic`
  )
}

export function createRuntimeViewportError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered runtime data in \`generateViewport()\`.\n\n` +
      `\`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` in \`generateViewport()\` prevents the page from being prerendered, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [static] Use a static viewport export instead of \`generateViewport()\`\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime#use-static-viewport\n` +
      `  - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime#allow-blocking-route`
  )
}

export function createDynamicViewportError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached data in \`generateViewport()\`.\n\n` +
      `\`fetch(...)\` or \`connection()\` in \`generateViewport()\` prevents the page from being prerendered, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - [cache] Cache the viewport data with \`"use cache"\` in \`generateViewport()\`\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#cache-the-viewport-data\n` +
      `  - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#allow-blocking-route`
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
      `    https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime#use-static-viewport\n` +
      `  - [cache] For uncached data (\`fetch\`, database calls): cache the viewport with \`"use cache"\` in \`generateViewport()\`\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#cache-the-viewport-data\n` +
      `  - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic#allow-blocking-route`
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
      `    https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime#use-static-metadata\n` +
      `  - [cache] Cache the metadata with \`"use cache"\` in \`generateMetadata()\`\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#cache-the-metadata\n` +
      `  - [dynamic] Render a marker component that calls \`await connection()\` inside \`<Suspense>\` on the page\n` +
      `    https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic#mark-the-route-as-dynamic`
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
