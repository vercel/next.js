export class ClientAssertionError extends Error {
  constructor(message: string, opts?: ErrorOptions) {
    super(message, opts)
    this.name = 'ClientAssertionError'
  }
}
