import { UsageError } from './usage-error'

export class MissingDefaultParallelRouteError extends UsageError {
  constructor(fullSegmentPath: string, slotName: string) {
    super(
      `Missing required default.js file for parallel route at ${fullSegmentPath}\n` +
        `The parallel route slot "${slotName}" is missing a default.js file. When using parallel routes, each slot must have a default.js file to serve as a fallback.\n\n` +
        `Create a default.js file at: ${fullSegmentPath}/default.js`,
      'https://nextjs.org/docs/messages/slot-missing-default'
    )

    this.name = 'MissingDefaultParallelRouteError'
  }
}
