import * as namespaceFromA from './a'

export function value() {
  return 'ok'
}

const key = ['value'].join('')
export const seenFromCycle = typeof namespaceFromA[key]
