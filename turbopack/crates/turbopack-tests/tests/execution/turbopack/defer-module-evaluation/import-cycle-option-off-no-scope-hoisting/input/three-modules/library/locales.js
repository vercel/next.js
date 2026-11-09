import { LOCALES } from '../constants.js'

globalThis.deferEvents.push('three-modules:locales')

export function extraLocales() {
  return LOCALES.includes('fr') ? [] : ['fr']
}
