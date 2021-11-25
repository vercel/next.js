import { IncomingMessage } from 'http'
import { WebIncomingMessage } from '../../../server/web/http-adapter'

export function detectLocaleCookie(
  req: IncomingMessage | WebIncomingMessage,
  locales: string[]
) {
  const { NEXT_LOCALE } = (req as any).cookies || {}
  return NEXT_LOCALE
    ? locales.find(
        (locale: string) => NEXT_LOCALE.toLowerCase() === locale.toLowerCase()
      )
    : undefined
}
