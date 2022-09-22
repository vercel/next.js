export const NOT_FOUND_ERROR_CODE = 'NEXT_NOT_FOUND'

export function notFound() {
  // eslint-disable-next-line no-throw-literal
  throw {
    code: NOT_FOUND_ERROR_CODE,
  }
}
