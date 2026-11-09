import { LOCALES } from '../constants.js'

export function format(value) {
  return value + ':' + LOCALES.join(',')
}
