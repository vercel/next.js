import { randomUUID } from 'node:crypto'
import { normalize } from './normalize'

export function getValue() {
  return randomUUID()
}

// Only the page uses this export, so the normalizer's import edge is unused
// in the route handler. This must not change the cached function's code hash.
export function getKind() {
  return normalize('PAGE-API')
}
