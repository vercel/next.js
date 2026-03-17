import type { Instant } from 'next'

export const unstable_instant: Instant = {
  prefetch: 'runtime',
  generateSamples: async () => [
    {
      params: {
        slug: 'from-generate-samples',
      },
    },
  ],
}

export default function Page({ params }: { params: { slug: string } }) {
  return <p>slug: {params.slug}</p>
}
