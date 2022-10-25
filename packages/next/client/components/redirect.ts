export const REDIRECT_ERROR_CODE = 'NEXT_REDIRECT'

export function redirect(url: string) {
  // eslint-disable-next-line no-throw-literal
  const error = new Error(REDIRECT_ERROR_CODE)
  ;(error as any).digest = REDIRECT_ERROR_CODE + ';' + url
  throw error
}
