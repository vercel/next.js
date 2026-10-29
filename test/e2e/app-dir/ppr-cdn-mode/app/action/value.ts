import { cacheTag } from 'next/cache'

// In-memory, so the value only survives while one `next start` process runs.
let version = 0

export function bumpVersion() {
  version += 1
}

export async function getValue() {
  'use cache'
  cacheTag('ppr-cdn-mode:value')
  return `version ${version}`
}
