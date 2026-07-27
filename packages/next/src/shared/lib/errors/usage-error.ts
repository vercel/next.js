export class UsageError extends Error {
  constructor(message: string, docUrl: string) {
    super(`${message}\n\nLearn more: ${docUrl}`)
    this.name = 'UsageError'

    // This error is meant to interrupt the server start/build process
    // but the stack trace isn't meaningful, as it points to internal code.
    this.stack = undefined
  }
}
