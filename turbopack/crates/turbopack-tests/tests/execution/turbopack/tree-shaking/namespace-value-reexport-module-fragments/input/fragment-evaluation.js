import { events } from './fragment-events'

const evaluationOnly = events.push('first')
events.push('second')

export function readUnusedEvaluation() {
  return evaluationOnly + 'UNUSED_EVALUATION_FUNCTION'
}
