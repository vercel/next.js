export const CAUGHT_POSTPONE_ERROR_CODE = 'CAUGHT_POSTPONE_ERROR'

export class CaughtPostponeError extends Error {
  digest: typeof CAUGHT_POSTPONE_ERROR_CODE = CAUGHT_POSTPONE_ERROR_CODE

  constructor(type: string) {
    super(`Postpone Error: ${type}`)
  }
}

export const isCaughtPostponeError = (err: any) =>
  err.digest === CAUGHT_POSTPONE_ERROR_CODE
