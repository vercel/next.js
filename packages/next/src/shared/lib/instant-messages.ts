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
      `\n    https://nextjs.org/docs/messages/instant-unrendered-segment#render-the-dropped-segment` +
      `\n  - [ignore] Set \`export const instant = false\` to silence this warning and opt the dropped segment out of instant-navigation validation` +
      `\n    https://nextjs.org/docs/messages/instant-unrendered-segment#skip-validation-on-the-segment`
  }
  return new Error(message)
}

export function createLinkPrefetchPartialError(pathname: string): Error {
  return new Error(
    `Next.js encountered dynamic data during prefetching for "${pathname}".\n\n` +
      `This will lead to slower, more expensive prefetches.\n\n` +
      `Ways to fix this:\n` +
      `  - [upgrade] Opt into Partial Prefetching by exporting \`const prefetch = 'partial'\` from the page or layout, or by setting \`partialPrefetching: true\` in next.config to opt the whole app in\n` +
      `    https://nextjs.org/docs/messages/instant-link-prefetch-partial#opt-into-partial-prefetching\n` +
      `  - [disable] Remove \`prefetch={true}\` from the <Link> to use the default prefetch\n` +
      `    https://nextjs.org/docs/messages/instant-link-prefetch-partial#use-the-default-prefetch\n` +
      `  - [ignore] Set \`export const instant = false\` to silence this warning and opt the route out of instant-navigation validation\n` +
      `    https://nextjs.org/docs/messages/instant-link-prefetch-partial#disable-validation-on-this-route`
  )
}
