import { prefetch } from 'next/cache'

export async function test() {
  await prefetch()
  return null
}
