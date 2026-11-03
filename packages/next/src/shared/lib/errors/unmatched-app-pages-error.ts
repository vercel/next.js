export class UnmatchedAppPagesError extends Error {
  constructor(pagePaths: readonly string[]) {
    const formattedPagePaths = pagePaths
      .map((pagePath) => `- ${pagePath}`)
      .join('\n')
    super(
      `The following page files do not match any complete route:\n${formattedPagePaths}\n\nEvery page must be part of at least one complete route. Add matching pages or default files for the sibling parallel route slots, or remove the unreachable pages.`
    )

    this.name = 'UnmatchedAppPagesError'
    this.stack = undefined
  }
}
