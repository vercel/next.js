export class HardDeprecatedConfigError extends Error {
  constructor(message: string) {
    super(message)

    // This error is meant to interrupt the server start/build process
    // but the stack trace isn't meaningful, as it points to internal code.
    this.stack = undefined
  }
}
