export function runtimeBodyMessage(route: string): string {
  return (
    `Route "${route}" can't load instantly.\n\n` +
    `Cause: A request-time API was used without a surrounding ` +
    `<Suspense> boundary. This prevents Next.js from prerendering ` +
    `any part of the page.\n\n` +
    `Common triggers:\n` +
    `  - cookies()\n` +
    `  - headers()\n` +
    `  - await params (in a Page or Layout)\n` +
    `  - await searchParams (in a Page)\n` +
    `  - draftMode()\n\n` +
    `Fix: Wrap the component that calls the API in <Suspense>, move ` +
    `the API call into a child component wrapped in <Suspense>, or ` +
    `add a loading.js file to the route.\n\n` +
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
    `  - fetch() without "use cache"\n` +
    `  - Database or API calls without "use cache"\n` +
    `  - connection()\n` +
    `  - cookies(), headers()\n` +
    `  - await params, await searchParams\n\n` +
    `Fix: Cache the data with "use cache", wrap the component in ` +
    `<Suspense>, or add a loading.js file to the route.\n\n` +
    `Learn more: https://nextjs.org/docs/messages/blocking-route`
  )
}

export function runtimeMetadataMessage(route: string): string {
  return (
    `Route "${route}": A request-time API was used inside ` +
    `generateMetadata (or you have file-based metadata like icons that ` +
    `depend on dynamic params). The rest of the page could have been ` +
    `fully prerendered.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
  )
}

export function dynamicMetadataMessage(route: string): string {
  return (
    `Route "${route}": Data that can't be resolved at build time was ` +
    `used inside generateMetadata (e.g. cookies(), headers(), or an ` +
    `uncached fetch). The rest of the page could have been fully ` +
    `prerendered.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
  )
}

export function runtimeViewportMessage(route: string): string {
  return (
    `Route "${route}": A request-time API was used inside ` +
    `generateViewport. Viewport metadata must be available on page ` +
    `load, so this prevents prerendering.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
  )
}

export function dynamicViewportMessage(route: string): string {
  return (
    `Route "${route}": Data that can't be resolved at build time was ` +
    `used inside generateViewport (e.g. cookies(), headers(), or an ` +
    `uncached fetch). Viewport metadata must be available on page ` +
    `load, so this prevents prerendering.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
  )
}

export function disallowedDynamicViewportMessage(route: string): string {
  return (
    `Route "${route}": generateViewport depends on data that can't be ` +
    `resolved at build time, which prevents prerendering.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
  )
}

export function disallowedDynamicMetadataMessage(route: string): string {
  return (
    `Route "${route}": generateMetadata depends on data that can't be ` +
    `resolved at build time, but the rest of the route does not.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
  )
}
