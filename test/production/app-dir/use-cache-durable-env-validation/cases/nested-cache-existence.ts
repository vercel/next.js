import { unstable_cacheDurable } from 'next/cache'
import { hasEnv } from '../dependencies/existence'

async function inner() {
  'use cache: remote'
  return hasEnv()
}

export async function getValue() {
  'use cache: remote'
  unstable_cacheDurable()
  return inner()
}
