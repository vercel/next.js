export function runtimeBodyMessage(route: string): string {
  return (
    `Route "${route}" can't load instantly.\n\n` +
    `Cause: A request-time API was used without a surrounding ` +
    `<Suspense> boundary. This prevents Next.js from prerendering ` +
    `any part of the page.\n\n` +
    `Common triggers:\n` +
    `  - cookies(), headers()\n` +
    `  - await params, await searchParams\n\n` +
    `The right fix depends on which API triggered this and what ` +
    `behavior you want. Possible fixes:\n` +
    `  - <Suspense>: wrap the dynamic component so the rest loads instantly\n` +
    `  - Move the API call into a child component wrapped in <Suspense>\n` +
    `  - loading.js: add a route-level fallback\n\n` +
    `Learn more: https://nextjs.org/docs/messages/blocking-route`
  )
}

export function dynamicBodyMessage(route: string): string {
  return (
    `Route "${route}" can't load instantly.\n\n` +
    `Cause: Uncached data or a request-time API was used without a ` +
    `surrounding <Suspense> boundary. This prevents Next.js from ` +
    `prerendering any part of the page.\n\n` +
    `Common triggers:\n` +
    `  - cookies(), headers(), connection()\n` +
    `  - await params, await searchParams\n` +
    `  - fetch() or database calls without "use cache"\n\n` +
    `The right fix depends on which API triggered this and what ` +
    `behavior you want. Possible fixes:\n` +
    `  - <Suspense>: wrap the dynamic component so the rest loads instantly\n` +
    `  - loading.js: add a route-level fallback\n` +
    `  - "use cache": cache the data so it can be prerendered\n\n` +
    `Learn more: https://nextjs.org/docs/messages/blocking-route`
  )
}

export function runtimeMetadataMessage(route: string): string {
  return (
    `Route "${route}": Next.js encountered runtime data in generateMetadata().\n\n` +
    `This route's metadata is blocked, but the rest of its content can be prerendered.\n\n` +
    `Cause: A request-time API was used inside generateMetadata() ` +
    `(or you have file-based metadata like icons that depend on dynamic params).\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
  )
}

export function dynamicMetadataMessage(route: string): string {
  return (
    `Route "${route}": Next.js encountered uncached data in generateMetadata().\n\n` +
    `This route's metadata is blocked, but the rest of its content can be prerendered.\n\n` +
    `Cause: generateMetadata() depends on data that can't be resolved ` +
    `at build time (e.g. cookies(), headers(), an uncached fetch, or ` +
    `file-based metadata with dynamic params).\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
  )
}

export function runtimeViewportMessage(route: string): string {
  return (
    `Route "${route}" has viewport config that blocks loading.\n\n` +
    `Cause: A request-time API was used inside generateViewport(). ` +
    `Viewport metadata must be available on page load, so this ` +
    `prevents prerendering.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
  )
}

export function dynamicViewportMessage(route: string): string {
  return (
    `Route "${route}" has viewport config that blocks loading.\n\n` +
    `Cause: generateViewport() depends on data that can't be resolved ` +
    `at build time (e.g. cookies(), headers(), or an uncached fetch). ` +
    `Viewport metadata must be available on page load, so this ` +
    `prevents prerendering.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
  )
}

export function disallowedDynamicViewportMessage(route: string): string {
  return (
    `Route "${route}" has viewport config that blocks loading.\n\n` +
    `Cause: generateViewport() depends on data that can't be resolved ` +
    `at build time, but the rest of the page is fully static. ` +
    `This makes viewport configuration the only dynamic part, so the ` +
    `entire page can't be prerendered.\n\n` +
    `Fix: Cache the data with "use cache", or mark another part of ` +
    `the page as dynamic to confirm this is intentional.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
  )
}

export function disallowedDynamicMetadataMessage(route: string): string {
  return (
    `Route "${route}": Next.js encountered uncached or runtime data in generateMetadata().\n\n` +
    `This route's metadata is blocked, but the rest of its content can be prerendered.\n\n` +
    `Cause: generateMetadata() depends on data that can't be resolved ` +
    `at build time, but the rest of the page is fully static.\n\n` +
    `Fix: Cache the data with "use cache", or mark another part of ` +
    `the page as dynamic to confirm this is intentional.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
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
