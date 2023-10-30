export const POSTPONE_ERROR_CODE = 'POSTPONE_ERROR'

export class PostponeError extends Error {
  digest: typeof POSTPONE_ERROR_CODE = POSTPONE_ERROR_CODE

  constructor(type: string) {
    super(`Postpone Error: ${type}`)
  }
}

export const isPostponeError = (err: any) => err.digest === POSTPONE_ERROR_CODE
