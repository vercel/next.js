import { LOCALES } from './constants.js'

export const DEFAULT_LOCALE = 'de'

export function isSupported(locale) {
  return LOCALES.includes(locale)
}
