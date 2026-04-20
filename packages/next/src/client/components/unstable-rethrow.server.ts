import { isNextInternalError } from '../../lib/is-next-internal-error'

export function unstable_rethrow(error: unknown): void {
  if (isNextInternalError(error)) {
    throw error
  }

  if (error instanceof Error && 'cause' in error) {
    unstable_rethrow(error.cause)
  }
}
