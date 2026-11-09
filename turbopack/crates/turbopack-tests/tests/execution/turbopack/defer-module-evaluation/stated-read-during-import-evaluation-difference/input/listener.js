import { atEvaluation, format } from './library/uses-emitter.js'

globalThis.deferEvents.push('listener')

// `emitter.js` calls this while it is evaluated, if it is evaluated after this module.
globalThis.deferListeners.push(() => atEvaluation)

export function readInListener() {
  return atEvaluation
}

export function callInListener() {
  return format('text')
}
