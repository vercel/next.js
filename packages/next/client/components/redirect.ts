export const REDIRECT_ERROR_CODE = 'NEXT_REDIRECT'

export function redirect(url: string) {
  // eslint-disable-next-line no-throw-literal
  const error = new Error(REDIRECT_ERROR_CODE)
  ;(error as any).url = url
  ;(error as any).code = REDIRECT_ERROR_CODE
  throw error
}
