class ClientAssertionError extends Error {
  constructor(message: string, opts?: ErrorOptions) {
    super(message, opts)
    this.name = 'ClientAssertionError'
  }
}

export function assert(
  result: boolean,
  message?: string
): asserts result is true {
  if (!result) {
    throw new ClientAssertionError(message ?? 'Assertion failed')
  }
}
