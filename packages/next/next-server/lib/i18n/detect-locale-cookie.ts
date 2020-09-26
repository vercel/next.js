import { IncomingMessage } from 'http'
import cookie from 'next/dist/compiled/cookie'

export function detectLocaleCookie(req: IncomingMessage, locales: string[]) {
  let detectedLocale: string | undefined

  if (req.headers.cookie && req.headers.cookie.includes('NEXT_LOCALE')) {
    const header = req.headers.cookie
    const { NEXT_LOCALE } = cookie.parse(
      Array.isArray(header) ? header.join(';') : header
    )

    if (locales.some((locale: string) => NEXT_LOCALE === locale)) {
      detectedLocale = NEXT_LOCALE
    }
  }

  return detectedLocale
}
