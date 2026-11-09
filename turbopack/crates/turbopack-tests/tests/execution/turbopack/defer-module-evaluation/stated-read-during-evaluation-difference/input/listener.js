import { value, call } from './library/emitter.js'

globalThis.deferEvents.push('listener')

// `emitter.js` calls this while it is evaluated, if it is evaluated after this module.
globalThis.deferListeners.push(() => value)

export function readInListener() {
  return value
}

export function callInListener() {
  return call()
}
