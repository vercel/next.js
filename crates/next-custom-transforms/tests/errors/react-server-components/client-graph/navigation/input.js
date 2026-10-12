import { navigation } from 'next/cache'

export async function test() {
  await navigation()
  return null
}
