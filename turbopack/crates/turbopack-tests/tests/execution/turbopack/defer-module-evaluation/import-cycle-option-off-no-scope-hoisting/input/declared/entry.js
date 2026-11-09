import { format } from './library/format.js'
import { isSupported } from './config.js'

globalThis.deferEvents.push('declared:entry')

export function run() {
  return { formatted: format('x'), supported: isSupported('de') }
}
