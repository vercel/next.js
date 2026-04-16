export function runtimeBodyMessage(route: string): string {
  return (
    `Route "${route}": Next.js encountered runtime data during the initial render.\n\n` +
    `Accessing \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` ` +
    `blocks this page from streaming, resulting in a slower user experience.\n\n` +
    `Possible fixes:\n` +
    `  - Move the data access into a child component within a <Suspense> boundary\n` +
    `  - Use \`generateStaticParams\` to make route params static\n` +
    `  - Set \`export const instant = false\` to allow a blocking route\n\n` +
    `Learn more: https://nextjs.org/docs/messages/blocking-route`
  )
}

export function dynamicBodyMessage(route: string): string {
  return (
    `Route "${route}": Next.js encountered uncached or runtime data during the initial render.\n\n` +
    `Accessing \`fetch()\`, \`cookies()\`, \`headers()\`, \`params\`, ` +
    `\`searchParams\`, or \`connection()\` blocks this page from streaming, ` +
    `resulting in a slower user experience.\n\n` +
    `Possible fixes:\n` +
    `  - Cache the data access with \`"use cache"\`\n` +
    `  - Move the data access into a child component within a <Suspense> boundary\n` +
    `  - Use \`generateStaticParams\` to make route params static\n` +
    `  - Set \`export const instant = false\` to allow a blocking route\n\n` +
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
