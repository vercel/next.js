import { LOCALES } from '../constants.js'

globalThis.deferEvents.push('declared-eager-import:format')

const separator = LOCALES.length > 1 ? ',' : ''

export function format(value) {
  return value + ':' + LOCALES.join(separator)
}
