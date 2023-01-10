export const NOT_FOUND_ERROR_CODE = 'NEXT_NOT_FOUND'

export function notFound(): never {
  // eslint-disable-next-line no-throw-literal
  const error = new Error(NOT_FOUND_ERROR_CODE)
  ;(error as any).digest = NOT_FOUND_ERROR_CODE
  throw error
}
