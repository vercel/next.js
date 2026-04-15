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
  return `Route "${route}": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed inside \`generateMetadata\` or you have file-based metadata such as icons that depend on dynamic params segments. Except for this instance, the page would have been entirely prerenderable which may have been the intended behavior. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
}

export function dynamicMetadataMessage(route: string): string {
  return `Route "${route}": Uncached data or \`connection()\` was accessed inside \`generateMetadata\`. Except for this instance, the page would have been entirely prerenderable which may have been the intended behavior. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
}

export function runtimeViewportMessage(route: string): string {
  return `Route "${route}": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed inside \`generateViewport\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
}

export function dynamicViewportMessage(route: string): string {
  return `Route "${route}": Uncached data or \`connection()\` was accessed inside \`generateViewport\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
}

export function disallowedDynamicViewportMessage(route: string): string {
  return `Route "${route}" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
}

export function disallowedDynamicMetadataMessage(route: string): string {
  return `Route "${route}" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
}
