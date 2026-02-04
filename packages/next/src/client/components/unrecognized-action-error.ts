export class UnrecognizedActionError extends Error {
  constructor(...args: ConstructorParameters<typeof Error>) {
    super(...args)
    this.name = 'UnrecognizedActionError'
  }
}

/**
 * Check whether a server action call failed because the server action was not recognized by the server.
 * This can happen if the client and the server are not from the same deployment.
 *
 * Example usage:
 * ```ts
 * try {
 *   await myServerAction();
 * } catch (err) {
 *   if (unstable_isUnrecognizedActionError(err)) {
 *     // The client is from a different deployment than the server.
 *     // Reloading the page will fix this mismatch.
 *     window.alert("Please refresh the page and try again");
 *     return;
 *   }
 * }
 * ```
 * */
export function unstable_isUnrecognizedActionError(
  error: unknown
): error is UnrecognizedActionError {
  return !!(
    error &&
    typeof error === 'object' &&
    error instanceof UnrecognizedActionError
  )
}
