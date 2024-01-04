// This has to be a shared module which is shared between client component error boundary and dynamic component

const BAILOUT_TO_CSR = 'BAILOUT_TO_CSR'

export class BailoutToCSRError extends Error {
  digest: typeof BAILOUT_TO_CSR = BAILOUT_TO_CSR
}

export function isBailoutToCSRError(e: any): e is BailoutToCSRError {
  return e?.digest === BAILOUT_TO_CSR
}
