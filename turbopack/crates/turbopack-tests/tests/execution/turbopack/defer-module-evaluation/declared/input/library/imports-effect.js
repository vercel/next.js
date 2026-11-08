import { dependency } from '../dependency-with-effect.js'

globalThis.deferEvents.push('imports-effect')

export function readDependency() {
  return dependency
}
