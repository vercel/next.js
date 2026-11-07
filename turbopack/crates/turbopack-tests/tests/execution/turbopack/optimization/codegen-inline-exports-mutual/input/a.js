import { bValue } from './b'

globalThis.mutualAEvaluations = (globalThis.mutualAEvaluations ?? 0) + 1
export const aValue = 'a'
export function readB() {
  return bValue
}
