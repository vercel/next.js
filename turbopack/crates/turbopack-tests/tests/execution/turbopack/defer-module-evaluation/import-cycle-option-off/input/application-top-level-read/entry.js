import { format } from './format.js'
import { DEFAULT_LOCALE, isSupported } from './config.js'

const locale = DEFAULT_LOCALE

export function run() {
  return { formatted: format('x'), supported: isSupported(locale) }
}
