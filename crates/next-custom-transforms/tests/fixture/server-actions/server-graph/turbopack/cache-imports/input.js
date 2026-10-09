// An import annotation must not comment out the generated module.
import defaultValue, { used, unused, other } from './values'
import * as namespace from './namespace'
import { unrelated } from './unrelated'

export async function first(value) {
  'use cache'
  // Keep this comment terminated before the next statement.
  const local = value
  return used(local) + defaultValue + namespace.value
}

export const second = async () => {
  'use cache: x'
  return other()
}

export function nonCache() {
  return unrelated() + unused
}
