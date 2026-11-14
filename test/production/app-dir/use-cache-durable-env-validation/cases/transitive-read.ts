import { unstable_cacheDurable } from 'next/cache'
import { readEnv } from '../dependencies/read'

export async function getValue() {
  'use cache: remote'
  unstable_cacheDurable()
  return readEnv()
}
