const DYNAMIC_ERROR_CODE = 'DYNAMIC_SERVER_USAGE'

export class DynamicServerError extends Error {
  digest: typeof DYNAMIC_ERROR_CODE = DYNAMIC_ERROR_CODE

  constructor(public readonly description: string) {
    super(`Dynamic server usage: ${description}`)
  }
}

export function isDynamicServerError(err: unknown): err is DynamicServerError {
  if (
    typeof err !== 'object' ||
    err === null ||
    !('digest' in err) ||
    typeof err.digest !== 'string'
  ) {
    return false
  }

  return err.digest === DYNAMIC_ERROR_CODE
}
