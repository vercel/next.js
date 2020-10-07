import { IncomingMessage } from 'http'

export function detectLocaleCookie(req: IncomingMessage, locales: string[]) {
  let detectedLocale: string | undefined

  if (req.headers.cookie && req.headers.cookie.includes('NEXT_LOCALE')) {
    const { NEXT_LOCALE } = (req as any).cookies

    if (locales.some((locale: string) => NEXT_LOCALE === locale)) {
      detectedLocale = NEXT_LOCALE
    }
  }

  return detectedLocale
}
