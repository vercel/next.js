export class InvariantError extends Error {
  static name = 'InvariantError'

  constructor(message: string, options?: ErrorOptions) {
    super(
      `Invariant: ${message.endsWith('.') ? message : message + '.'} This is a bug in Next.js.`,
      options
    )
    this.name = 'InvariantError'
  }
}
