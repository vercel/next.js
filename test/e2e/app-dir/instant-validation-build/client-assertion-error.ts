class AssertionError extends Error {
  constructor(message: string, opts?: ErrorOptions) {
    super(message, opts)
    this.name = 'AssertionError'
  }
}

export function assert(
  result: boolean,
  message?: string
): asserts result is true {
  if (!result) {
    throw new AssertionError(message ?? 'Assertion failed')
  }
}
