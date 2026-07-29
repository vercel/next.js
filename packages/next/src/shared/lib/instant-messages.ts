export function createMountObservationTimeoutError(route: string): Error {
  return new Error(
    `Route "${route}": Could not validate that this route has instant navigation.\n\n` +
      `Next.js could not discover which parallel route slots render because client-side rendering did not settle in time. Something in a Client Component may be preventing rendering from completing.\n\n` +
      `Ways to fix this:\n` +
      `  - [retry] Reload the page with a hard refresh to validate against the full document render\n` +
      `  - [ignore] Set \`export const instant = false\` to opt the route out of instant-navigation validation`
  )
}

export function createUnrenderedSegmentError(
  route: string,
  missingFiles: readonly string[]
): Error {
  let message = `Route "${route}": Could not validate that a segment in your UI has instant navigation.`
  if (missingFiles.length > 0) {
    const label =
      missingFiles.length === 1 ? 'Dropped segment' : 'Dropped segments'
    message +=
      `\n\nThis segment was dropped from rendering. Issues that would prevent instant navigation will go undetected.` +
      `\n\n${label}:\n${missingFiles.map((p) => `  ${p}`).join('\n')}` +
      `\n\nWays to fix this:` +
      `\n  - [render] Render the dropped segment` +
      `\n  - [ignore] Set \`export const instant = false\` to opt the dropped segment out of instant-navigation validation` +
      `\n\nLearn more: https://nextjs.org/docs/messages/instant-unrendered-segment`
  }
  return new Error(message)
}

export function createLinkPrefetchPartialError(pathname: string): Error {
  return new Error(
    `Next.js encountered dynamic data during prefetching for "${pathname}".\n\n` +
      `This will lead to slower, more expensive prefetches.\n\n` +
      `Ways to fix this:\n` +
      `  - [upgrade] Opt into Partial Prefetching by exporting \`const prefetch = 'partial'\` from the page or layout, or by setting \`partialPrefetching: true\` in next.config to opt the whole app in\n` +
      `  - [disable] Remove \`prefetch={true}\` from the <Link> to use the default prefetch\n` +
      `  - [ignore] Set \`export const instant = false\` to opt the route out of instant-navigation validation\n\n` +
      `Learn more: https://nextjs.org/docs/messages/instant-link-prefetch-partial`
  )
}
