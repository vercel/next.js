import { unstable_noStore } from 'next/cache'

export function getUncachedRandomData() {
  unstable_noStore()
  return {
    random: Math.random(),
  }
}
