import { unstable_cacheDurable } from 'next/cache'
import { hasEnv } from '../dependencies/existence'

export async function getValue() {
  'use cache: remote'
  unstable_cacheDurable()
  return hasEnv()
}
