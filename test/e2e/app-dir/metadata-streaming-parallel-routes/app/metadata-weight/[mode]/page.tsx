import type { Metadata, Viewport } from 'next'

const weights: Record<string, number | undefined> = {
  equal: 1,
  higher: 2,
  'viewport-positive': 2,
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mode: string }>
}): Promise<Metadata> {
  const { mode } = await params
  return {
    title: `children ${mode} title`,
    weight: weights[mode],
  }
}

export function generateViewport(): Viewport {
  return {
    colorScheme: 'dark',
    weight: 0,
  }
}

export default function Page() {
  return <p>metadata weight children</p>
}
