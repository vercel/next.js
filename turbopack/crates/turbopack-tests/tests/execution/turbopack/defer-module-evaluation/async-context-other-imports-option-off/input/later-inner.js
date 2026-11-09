import { atEvaluation } from './library/inner.js'

globalThis.deferEvents.push('later-inner')

export const innerAtEvaluation = atEvaluation
