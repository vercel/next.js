import { unstable_navigation } from 'next/cache'

export async function test() {
  await unstable_navigation()
  return null
}
