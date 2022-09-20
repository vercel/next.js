export const REDIRECT_ERROR_CODE = 'NEXT_REDIRECT'

export function redirect(url: string) {
  // eslint-disable-next-line no-throw-literal
  throw {
    url,
    code: REDIRECT_ERROR_CODE,
  }
}
