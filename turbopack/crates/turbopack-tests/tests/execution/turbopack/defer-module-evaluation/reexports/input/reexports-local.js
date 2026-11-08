import { local } from './library/local-target.js'

globalThis.deferEvents.push('reexports-local')

export function readLocal() {
  return local
}

export { local }
