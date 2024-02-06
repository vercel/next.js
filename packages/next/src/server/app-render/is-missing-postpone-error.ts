export const MISSING_POSTPONE_DATA_ERROR = 'MISSING_POSTPONE_DATA_ERROR'

export class MissingPostponeDataError extends Error {
  digest: typeof MISSING_POSTPONE_DATA_ERROR = MISSING_POSTPONE_DATA_ERROR

  constructor(type: string) {
    super(`Missing Postpone Data Error: ${type}`)
  }
}

export const isMissingPostponeDataError = (err: any) =>
  err.digest === MISSING_POSTPONE_DATA_ERROR
