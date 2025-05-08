export class UnrecognizedActionError extends Error {
  constructor(...args: ConstructorParameters<typeof Error>) {
    super(...args)
    this.name = 'UnrecognizedActionError'
  }
}

export function unstable_isUnrecognizedActionError(
  error: unknown
): error is UnrecognizedActionError {
  if (!process.env.__NEXT_ERROR_FOR_UNRECOGNIZED_ACTIONS) {
    throw new Error(
      '`unstable_isUnrecognizedActionError` can only be used when `experimental.serverActions.errorOnUnrecognized` is enabled.'
    )
  }
  return !!(
    error &&
    typeof error === 'object' &&
    error instanceof UnrecognizedActionError
  )
}
