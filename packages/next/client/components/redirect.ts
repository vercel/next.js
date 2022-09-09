export const REDIRECT_ERROR_CODE = 'NEXT_REDIRECT'

class Redirect extends Error {
  url: string
  code: typeof REDIRECT_ERROR_CODE = REDIRECT_ERROR_CODE
  constructor(url: string) {
    // Message is not used.
    super('redirect')
    this.url = url
  }
}
export function redirect(url: string) {
  throw new Redirect(url)
}
