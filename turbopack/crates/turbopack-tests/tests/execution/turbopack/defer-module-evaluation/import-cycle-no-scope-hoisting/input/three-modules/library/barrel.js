export * from '../shared.js'
import { allLocales, loadLocales } from '../constants.js'

export async function describe() {
  return [...allLocales(), ...(await loadLocales())].join(',')
}
