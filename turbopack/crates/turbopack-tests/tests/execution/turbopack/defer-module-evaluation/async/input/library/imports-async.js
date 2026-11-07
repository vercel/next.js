import { value } from './async.js'

globalThis.deferEvents.push('imports-async')

export function readAsync() {
  return value
}
