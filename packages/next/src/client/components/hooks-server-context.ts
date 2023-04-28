const DYNAMIC_ERROR_CODE = 'DYNAMIC_SERVER_USAGE'

export class DynamicServerError extends Error {
  digest: typeof DYNAMIC_ERROR_CODE = DYNAMIC_ERROR_CODE

  constructor(type: string) {
    super(`Dynamic server usage: ${type}`)
  }
}

export function isDynamicServerError(err: any): err is DynamicServerError {
  return 'digest' in err && err.digest === DYNAMIC_ERROR_CODE
}
