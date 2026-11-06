import { unstable_cacheDurable } from 'next/cache'
import { readEnv } from '../dependencies/read'

async function inner() {
  'use cache: remote'
  return readEnv()
}

export async function getValue() {
  'use cache: remote'
  unstable_cacheDurable()
  return inner()
}
