import { LOCALES } from './constants.js'

globalThis.deferEvents.push('declared-eager-import:config')

export const DEFAULT_LOCALE = 'de'

export function isSupported(locale) {
  return LOCALES.includes(locale)
}
