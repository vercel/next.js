export function runtimeBodyMessage(route: string): string {
  return (
    `Route "${route}" can't load instantly. ` +
    `A request-time API (like cookies, headers, params, or searchParams) ` +
    `was used without a <Suspense> boundary. The call stack shows which ` +
    `API was accessed.\n\n` +
    `To fix this, either:\n` +
    `  - Wrap the component in <Suspense> so the page can show a ` +
    `prerendered fallback while this part streams in.\n` +
    `  - Move the access into a deeper component wrapped in <Suspense>.\n\n` +
    `Learn more: https://nextjs.org/docs/messages/blocking-route`
  )
}

export function dynamicBodyMessage(route: string): string {
  return (
    `Route "${route}" can't load instantly. ` +
    `Uncached data (like fetch() without a cache, or connection()) was ` +
    `used without a <Suspense> boundary. The call stack shows where it ` +
    `was accessed.\n\n` +
    `To fix this, either:\n` +
    `  - Wrap the component in <Suspense> so the page can show a ` +
    `prerendered fallback while this part streams in.\n` +
    `  - Cache the data with "use cache" so it can be resolved at build ` +
    `time.\n\n` +
    `Learn more: https://nextjs.org/docs/messages/blocking-route`
  )
}

export function runtimeMetadataMessage(route: string): string {
  return (
    `Route "${route}": A request-time API was used inside ` +
    `generateMetadata (or you have file-based metadata like icons that ` +
    `depend on dynamic params). The rest of the page could have been ` +
    `fully prerendered.\n\n` +
    `To fix this, either:\n` +
    `  - Remove the request-time dependency from generateMetadata.\n` +
    `  - Add connection() inside a <Suspense> boundary elsewhere in the ` +
    `page to signal that dynamic rendering is intentional.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
  )
}

export function dynamicMetadataMessage(route: string): string {
  return (
    `Route "${route}": Uncached data or connection() was used inside ` +
    `generateMetadata. The rest of the page could have been fully ` +
    `prerendered.\n\n` +
    `To fix this, either:\n` +
    `  - Cache the data in generateMetadata with "use cache".\n` +
    `  - Add connection() inside a <Suspense> boundary elsewhere in the ` +
    `page to signal that dynamic rendering is intentional.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
  )
}

export function runtimeViewportMessage(route: string): string {
  return (
    `Route "${route}": A request-time API was used inside ` +
    `generateViewport. Viewport metadata must be available on page load, ` +
    `so this prevents prerendering.\n\n` +
    `To fix this, either:\n` +
    `  - Remove the request-time dependency from generateViewport.\n` +
    `  - Put a <Suspense> around your document <body> to opt into fully ` +
    `dynamic rendering.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
  )
}

export function dynamicViewportMessage(route: string): string {
  return (
    `Route "${route}": Uncached data or connection() was used inside ` +
    `generateViewport. Viewport metadata must be available on page load, ` +
    `so this prevents prerendering.\n\n` +
    `To fix this, either:\n` +
    `  - Cache the data in generateViewport with "use cache".\n` +
    `  - Put a <Suspense> around your document <body> to opt into fully ` +
    `dynamic rendering.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
  )
}

export function disallowedDynamicViewportMessage(route: string): string {
  return (
    `Route "${route}": generateViewport depends on request-time data ` +
    `or uncached fetches, which prevents prerendering. Either cache the ` +
    `data or put a <Suspense> around your document <body> to allow fully ` +
    `dynamic rendering.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
  )
}

export function disallowedDynamicMetadataMessage(route: string): string {
  return (
    `Route "${route}": generateMetadata depends on request-time data ` +
    `or uncached fetches, but the rest of the route does not. Either ` +
    `cache the metadata or add connection() inside a <Suspense> ` +
    `boundary to signal that dynamic rendering is intentional.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
  )
}
