export class MissingDefaultParallelRouteError extends Error {
  constructor(fullSegmentPath: string, slotName: string) {
    super(
      `Missing required default.js file for parallel route at ${fullSegmentPath}\n` +
        `The parallel route slot "${slotName}" is missing a default.js file. When using parallel routes, each slot must have a default.js file to serve as a fallback.\n\n` +
        `Create a default.js file at: ${fullSegmentPath}/default.js\n\n` +
        `https://nextjs.org/docs/messages/slot-missing-default`
    )

    this.name = 'MissingDefaultParallelRouteError'

    // This error is meant to interrupt the server start/build process
    // but the stack trace isn't meaningful, as it points to internal code.
    this.stack = undefined
  }
}
