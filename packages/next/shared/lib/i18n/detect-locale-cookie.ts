import { IncomingMessage } from 'http'

export function detectLocaleCookie(
  req: IncomingMessage,
  locales: string[],
  cookieName: string
) {
  const { [cookieName]: cookie } = (req as any).cookies || {}

  return cookie
    ? locales.find(
        (locale: string) => cookie.toLowerCase() === locale.toLowerCase()
      )
    : undefined
}
