import { unstable_cacheDurable } from 'next/cache'

export async function getValue() {
  'use cache: remote'
  unstable_cacheDurable()
  return process.env.UNSTABLE_DURABLE_TEST
}
