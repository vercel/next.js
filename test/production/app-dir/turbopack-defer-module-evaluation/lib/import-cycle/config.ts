import { LOCALES } from './constants'

export const DEFAULT_LOCALE = 'de'

export function isSupported(locale: string) {
  return LOCALES.includes(locale)
}
