export const NOT_FOUND_ERROR_CODE = 'NEXT_NOT_FOUND'

export class NotFound extends Error {
  readonly digest = NOT_FOUND_ERROR_CODE
}
