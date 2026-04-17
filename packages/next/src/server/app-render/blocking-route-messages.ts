export function createRuntimeBodyError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered runtime data during the initial render.\n\n` +
      `\`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` accessed outside of \`<Suspense>\` blocks navigation, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - Move the data access into a child component within a <Suspense> boundary\n` +
      `  - Use \`generateStaticParams\` to make route params static\n` +
      `  - Set \`export const instant = false\` to allow a blocking route\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-route`
  )
}

export function createDynamicBodyError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached data during the initial render.\n\n` +
      `\`fetch(...)\` or \`connection()\` accessed outside of \`<Suspense>\` blocks navigation, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - Cache the data access with \`"use cache"\`\n` +
      `  - Move the data access into a child component within a <Suspense> boundary\n` +
      `  - Set \`export const instant = false\` to allow a blocking route\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-route`
  )
}

/**
 * NOTE: Prefer `createRuntimeBodyError` or `createDynamicBodyError`.
 * Only use this in situations like build-time static validation, where
 * we can't pinpoint a more specific reason.
 */
export function createDynamicOrRuntimeBodyError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached or runtime data during the initial render.\n\n` +
      `\`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` blocks navigation, leading to a slower user experience.\n\n` +
      `Ways to fix this:\n` +
      `  - Cache the data access with \`"use cache"\`\n` +
      `  - Move the data access into a child component within a <Suspense> boundary\n` +
      `  - Use \`generateStaticParams\` to make route params static\n` +
      `  - Set \`export const instant = false\` to allow a blocking route\n\n` +
      `Learn more: https://nextjs.org/docs/messages/blocking-route`
  )
}

export function createRuntimeMetadataError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` inside \`generateMetadata\`, or you have file-based metadata such as icons that depend on dynamic params segments. Except for this instance, the page would have been entirely prerenderable which may have been the intended behavior. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
  )
}

export function createDynamicMetadataError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached data such as \`fetch(...)\` or \`connection()\` inside \`generateMetadata\`. Except for this instance, the page would have been entirely prerenderable which may have been the intended behavior. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`
  )
}

export function createRuntimeViewportError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` inside \`generateViewport\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
  )
}

export function createDynamicViewportError(route: string): Error {
  return new Error(
    `Route "${route}": Next.js encountered uncached data such as \`fetch(...)\` or \`connection()\` inside \`generateViewport\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`
  )
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
