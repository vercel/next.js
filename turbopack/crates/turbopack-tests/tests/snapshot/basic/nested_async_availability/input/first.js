import { shared } from './shared'

export function first() {
  return Promise.all([import('./second'), import('./third')]).then(
    ([{ second }, { third }]) => shared + second + third
  )
}
