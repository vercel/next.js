import { IncomingMessage } from 'http'

export function detectLocaleCookie(
  req: IncomingMessage,
  locales: string[],
  localeCookie: string
) {
  if (req.headers.cookie && req.headers.cookie.includes(localeCookie)) {
    const localeFromCookie = (req as any).cookies[localeCookie]
    return locales.find(
      (locale: string) =>
        localeFromCookie.toLowerCase() === locale.toLowerCase()
    )
  }
}
