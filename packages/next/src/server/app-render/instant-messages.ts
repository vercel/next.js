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
      `\n  - [ignore] Set \`export const instant = false\` on the dropped segment to skip validation` +
      `\n    https://nextjs.org/docs/messages/instant-unrendered-segment#skip-validation-on-the-segment`
  }
  return new Error(message)
}

export function createLinkPrefetchPartialError(pathname: string): Error {
  return new Error(
    `A <Link prefetch={true}> navigated to "${pathname}", but Partial Prefetching is not enabled for that route.\n\n` +
      `This prevents the prefetch from being partial, leading to the route's dynamic data being included in the prefetch.\n\n` +
      `Ways to fix this:\n` +
      `  - [upgrade] Opt the route into Partial Prefetching by exporting \`const prefetch = 'partial'\` from the page or layout\n` +
      `    https://nextjs.org/docs/messages/instant-link-prefetch-partial#opt-into-partial-prefetching\n` +
      `  - [remove] Remove \`prefetch={true}\` from the <Link> so it prefetches only the App Shell\n` +
      `    https://nextjs.org/docs/messages/instant-link-prefetch-partial#prefetch-only-the-app-shell\n` +
      `  - [ignore] Set \`export const instant = false\` on the route to disable validation\n` +
      `    https://nextjs.org/docs/messages/instant-link-prefetch-partial#disable-validation-on-this-route`
  )
}
