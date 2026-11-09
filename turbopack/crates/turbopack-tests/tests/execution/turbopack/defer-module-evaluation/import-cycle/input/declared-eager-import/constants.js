import { DEFAULT_LOCALE } from './config.js'

globalThis.deferEvents.push('declared-eager-import:constants')

export const LOCALES = [DEFAULT_LOCALE, 'en']
