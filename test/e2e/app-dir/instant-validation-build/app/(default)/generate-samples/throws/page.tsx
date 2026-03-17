import type { Instant } from 'next'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  generateSamples: async () => {
    throw new Error('generateSamples exploded')
  },
}

export default function Page() {
  return <p>generateSamples throws</p>
}
