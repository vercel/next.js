import { unstable_cacheDurable } from 'next/cache'

export async function getValue() {
  'use cache: remote'
  unstable_cacheDurable()
  if (process.env.UNSTABLE_DURABLE_TEST_EXISTENCE) {
    return true
  }
  return false
}
