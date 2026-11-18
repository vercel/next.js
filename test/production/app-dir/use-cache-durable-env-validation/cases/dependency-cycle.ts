import { unstable_cacheDurable } from 'next/cache'
import { readCycleA } from '../dependencies/cycle-a'

export async function getValue() {
  'use cache: remote'
  unstable_cacheDurable()
  return readCycleA(2)
}
