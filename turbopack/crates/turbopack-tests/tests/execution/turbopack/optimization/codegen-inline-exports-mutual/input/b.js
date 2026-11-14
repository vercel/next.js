import { aValue } from './a'

globalThis.mutualBEvaluations = (globalThis.mutualBEvaluations ?? 0) + 1
export const bValue = 'b'
export function readA() {
  return aValue
}
