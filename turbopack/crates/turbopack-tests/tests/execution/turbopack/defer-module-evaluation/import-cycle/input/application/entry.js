import { format } from './format.js'
import { isSupported } from './config.js'

export function run() {
  return { formatted: format('x'), supported: isSupported('de') }
}
