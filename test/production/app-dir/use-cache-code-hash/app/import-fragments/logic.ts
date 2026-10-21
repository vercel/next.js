import { first } from './first'
import { second } from './second'
import { unrelated } from './unrelated'

export async function cachedFirst() {
  'use cache'
  return first()
}

export const cachedSecond = async () => {
  'use cache'
  return second()
}

let shared = 0

// Shared module state deliberately keeps this implementation in the source module.
export async function cachedShared() {
  'use cache'
  return `shared-${shared}`
}

export function nonCache() {
  shared++
  return unrelated()
}
