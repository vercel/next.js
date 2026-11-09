import { LOCALES } from './constants'

export function format(value: string) {
  return value + ':' + LOCALES.join(',')
}
