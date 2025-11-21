export class NetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'NetworkError'
    // Preserve error cause when supported
    if (options && 'cause' in options) {
      ;(this as any).cause = options.cause
    }
  }
}
