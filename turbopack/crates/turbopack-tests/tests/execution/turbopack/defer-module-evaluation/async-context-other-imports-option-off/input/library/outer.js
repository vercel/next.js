import { atEvaluation } from './inner.js'

globalThis.deferEvents.push('outer')

export const innerAtEvaluation = atEvaluation
