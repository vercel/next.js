import { IncomingMessage } from 'http'

export function detectLocaleCookie(req: IncomingMessage, locales: string[]) {
  if (req.headers.cookie && req.headers.cookie.includes('NEXT_LOCALE')) {
    const { NEXT_LOCALE } = (req as any).cookies
    return locales.find(
      (locale: string) => NEXT_LOCALE.toLowerCase() === locale.toLowerCase()
    )
  }
}
