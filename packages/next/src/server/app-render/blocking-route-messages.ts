export function runtimeBodyMessage(route: string): string {
  return (
    `Route "${route}" can't load instantly. A request-time API ` +
    `(cookies, headers, searchParams, or params) was used without a ` +
    `<Suspense> boundary.\n\n` +
    `Possible fixes: add a loading.js to this route, or wrap the ` +
    `affected component in <Suspense>. The best approach depends on ` +
    `which API is involved.\n` +
    `https://nextjs.org/docs/messages/blocking-route`
  )
}

export function dynamicBodyMessage(route: string): string {
  return (
    `Route "${route}" can't load instantly. Either a request-time API ` +
    `(cookies, headers, searchParams, params) or uncached data ` +
    `(connection, fetch without "use cache") was used without a ` +
    `<Suspense> boundary.\n\n` +
    `Possible fixes: add a loading.js to this route, wrap the ` +
    `affected component in <Suspense>, or cache data with "use cache". ` +
    `The best approach depends on your case.\n` +
    `https://nextjs.org/docs/messages/blocking-route`
  )
}

export function runtimeMetadataMessage(route: string): string {
  return (
    `Route "${route}": A request-time API was used inside ` +
    `generateMetadata (or you have file-based metadata like icons that ` +
    `depend on dynamic params). The rest of the page could have been ` +
    `fully prerendered.\n\n` +
    `Read more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
  )
}

export function dynamicMetadataMessage(route: string): string {
  return (
    `Route "${route}": Data that can't be resolved at build time was ` +
    `used inside generateMetadata (e.g. cookies(), headers(), or an ` +
    `uncached fetch). The rest of the page could have been fully ` +
    `prerendered.\n\n` +
    `Read more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
  )
}

export function runtimeViewportMessage(route: string): string {
  return (
    `Route "${route}": A request-time API was used inside ` +
    `generateViewport. Viewport metadata must be available on page ` +
    `load, so this prevents prerendering.\n\n` +
    `Read more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
  )
}

export function dynamicViewportMessage(route: string): string {
  return (
    `Route "${route}": Data that can't be resolved at build time was ` +
    `used inside generateViewport (e.g. cookies(), headers(), or an ` +
    `uncached fetch). Viewport metadata must be available on page ` +
    `load, so this prevents prerendering.\n\n` +
    `Read more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
  )
}

export function disallowedDynamicViewportMessage(route: string): string {
  return (
    `Route "${route}": generateViewport depends on data that can't be ` +
    `resolved at build time, which prevents prerendering.\n\n` +
    `Read more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
  )
}

export function disallowedDynamicMetadataMessage(route: string): string {
  return (
    `Route "${route}": generateMetadata depends on data that can't be ` +
    `resolved at build time, but the rest of the route does not.\n\n` +
    `Read more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
  )
}
