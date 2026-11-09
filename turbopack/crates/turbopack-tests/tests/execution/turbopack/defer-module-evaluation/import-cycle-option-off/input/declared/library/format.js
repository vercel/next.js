import { LOCALES } from '../constants.js'

globalThis.deferEvents.push('declared:format')

export function format(value) {
  return value + ':' + LOCALES.join(',')
}
