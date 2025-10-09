export class MissingDefaultParallelRouteError extends Error {
  constructor(segmentPath: string, slotName: string) {
    const actualSegment = slotName === 'children' ? '' : `/${slotName}`
    const fullPath = `${segmentPath}${actualSegment}`

    super(
      `Missing required default.js file for parallel route at ${fullPath}\n` +
        `The parallel route slot "${slotName}" is missing a default.js file. When using parallel routes, each slot must have a default.js file to serve as a fallback.\n\n` +
        `Create a default.js file at: ${fullPath}/default.js\n\n` +
        `https://nextjs.org/docs/app/building-your-application/routing/parallel-routes#defaultjs`
    )

    this.name = 'MissingDefaultParallelRouteError'
  }
}
