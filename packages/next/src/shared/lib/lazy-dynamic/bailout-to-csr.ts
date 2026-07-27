// This has to be a shared module which is shared between client component error boundary and dynamic component
const BAILOUT_TO_CSR = 'BAILOUT_TO_CLIENT_SIDE_RENDERING'

/** An error that should be thrown when we want to bail out to client-side rendering. */
export class BailoutToCSRError extends Error {
  public readonly digest = BAILOUT_TO_CSR

  constructor(public readonly reason: string) {
    super(`Bail out to client-side rendering: ${reason}`)
  }
}

/** Checks if a passed argument is an error that is thrown if we want to bail out to client-side rendering. */
export function isBailoutToCSRError(err: unknown): err is BailoutToCSRError {
  if (typeof err !== 'object' || err === null || !('digest' in err)) {
    return false
  }

  return err.digest === BAILOUT_TO_CSR
}
