import { IncomingMessage } from 'http'
import { WebRequestBasedIncomingMessage } from '../../../build/webpack/loaders/next-middleware-ssr-loader/utils'

export function detectLocaleCookie(
  req: IncomingMessage | WebRequestBasedIncomingMessage,
  locales: string[]
) {
  const { NEXT_LOCALE } = (req as any).cookies || {}
  return NEXT_LOCALE
    ? locales.find(
        (locale: string) => NEXT_LOCALE.toLowerCase() === locale.toLowerCase()
      )
    : undefined
}
