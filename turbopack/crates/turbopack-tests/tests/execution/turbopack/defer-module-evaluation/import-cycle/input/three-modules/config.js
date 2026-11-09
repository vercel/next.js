import { extraLocales } from './library/locales.js'

globalThis.deferEvents.push('three-modules:config')

export const config = { locale: 'de' }

export function supported() {
  return [config.locale, ...extraLocales()]
}
