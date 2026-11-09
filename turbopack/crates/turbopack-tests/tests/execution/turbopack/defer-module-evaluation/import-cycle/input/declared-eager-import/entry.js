import { format } from './library/format.js'
import { DEFAULT_LOCALE, isSupported } from './config.js'

globalThis.deferEvents.push('declared-eager-import:entry')

const locale = DEFAULT_LOCALE

export function run() {
  return { formatted: format('x'), supported: isSupported(locale) }
}
