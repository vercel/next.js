import { config } from './config.js'
import { extraLocales } from './library/locales.js'

export const LOCALES = [config.locale, 'en']

export function allLocales() {
  return [...LOCALES, ...extraLocales()]
}

export async function loadLocales() {
  const loaded = await import('./library/locales.js')
  return loaded.extraLocales()
}
