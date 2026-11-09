import { atEvaluation } from './library/commonjs.js'

globalThis.deferEvents.push('later-commonjs')

export function commonjsAtEvaluation() {
  return atEvaluation
}
