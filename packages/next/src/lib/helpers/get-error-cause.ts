/**
 * This function iterates through the `cause` property of an error object
 * and it's causes and returns the original cause. *
 *
 * External libraries might catch errors, wrap them and re-throw them.
 * We are interested in the original error thrown by Next.js, and no errors
 * thrown by Next.js have a `cause` property, so it's safe to recurse into
 * `err.cause` to get to the original cause.
 */
export function getErrorCause(err: unknown): unknown {
  if (
    typeof err === 'object' &&
    err !== null &&
    'cause' in err &&
    typeof err.cause === 'object' &&
    err.cause !== null
  ) {
    return getErrorCause(err.cause)
  }
  return err
}
