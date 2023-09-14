import { IncomingMessage } from 'http'

import type { BaseNextRequest } from '../../../server/base-http'

export function detectLocaleCookie(req: BaseNextRequest | IncomingMessage, locales: string[]) {
  const { NEXT_LOCALE } = (req as any).cookies || {}
  return NEXT_LOCALE
    ? locales.find(
        (locale: string) => NEXT_LOCALE.toLowerCase() === locale.toLowerCase()
      )
    : undefined
}
