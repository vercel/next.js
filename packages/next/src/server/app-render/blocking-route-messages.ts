export function runtimeBodyMessage(route: string): string {
  return (
    `Route "${route}": Runtime data such as \`cookies()\`, \`headers()\`, ` +
    `\`params\`, or \`searchParams\` was accessed during the static prerender.\n\n` +
    `This prevents Next.js from prerendering this page.\n\n` +
    `Possible fixes:\n` +
    `  - Add a <Suspense> boundary around the component that accesses the data\n` +
    `  - Move the access into a child component inside an existing <Suspense>\n\n` +
    `Learn more: https://nextjs.org/docs/messages/blocking-route`
  )
}

export function dynamicBodyMessage(route: string): string {
  return (
    `Route "${route}": Dynamic or runtime data such as \`fetch()\`, ` +
    `\`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, ` +
    `or \`connection()\` was accessed during the static prerender.\n\n` +
    `This prevents Next.js from prerendering this page.\n\n` +
    `Possible fixes:\n` +
    `  - Add a <Suspense> boundary around the component that accesses the data\n` +
    `  - Move the access into a child component inside an existing <Suspense>\n\n` +
    `Learn more: https://nextjs.org/docs/messages/blocking-route`
  )
}

export function runtimeMetadataMessage(route: string): string {
  return (
    `Route "${route}" has metadata that blocks loading.\n\n` +
    `Cause: A request-time API was used inside generateMetadata() ` +
    `(or you have file-based metadata like icons that depend on ` +
    `dynamic params). The rest of the page could have been fully ` +
    `prerendered.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
  )
}

export function dynamicMetadataMessage(route: string): string {
  return (
    `Route "${route}" has metadata that blocks loading.\n\n` +
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
    `Route "${route}" has metadata that blocks loading.\n\n` +
    `Cause: generateMetadata() depends on data that can't be resolved ` +
    `at build time, but the rest of the page is fully static. ` +
    `This makes metadata the only dynamic part, so the entire page ` +
    `can't be prerendered.\n\n` +
    `Fix: Cache the data with "use cache", or mark another part of ` +
    `the page as dynamic to confirm this is intentional.\n\n` +
    `Learn more: ` +
    `https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
  )
}
