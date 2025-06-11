export class NoFallbackError extends Error {
  constructor() {
    super()
    this.message = 'Internal: NoFallbackError'
  }
}
