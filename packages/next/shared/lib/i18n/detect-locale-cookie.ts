import { IncomingMessage } from 'http'

export function detectLocaleCookie(req: IncomingMessage, locales: string[]) {
  const { NEXT_LOCALE } = (req as any).cookies || {}
  return NEXT_LOCALE
    ? locales.find(
        (locale: string) => NEXT_LOCALE.toLowerCase() === locale.toLowerCase()
      )
    : undefined
}
