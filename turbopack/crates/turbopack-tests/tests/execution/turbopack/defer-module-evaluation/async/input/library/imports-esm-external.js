import { a } from 'esm-external/package'

globalThis.deferEvents.push('imports-esm-external')

export function readExternal() {
  return a
}
