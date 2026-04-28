export class NoFallbackError extends Error {
  static name = 'NoFallbackError'

  constructor() {
    super()
    this.message = 'Internal: NoFallbackError'
  }
}
