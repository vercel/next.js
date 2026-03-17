import type { Instant } from 'next'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  generateSamples: async () => [],
}

export default function Page() {
  return <p>generateSamples returned an empty array</p>
}
