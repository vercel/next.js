import type { Metadata, Viewport } from 'next'

const weights: Record<string, number | undefined> = {
  negative: -1,
  reset: 0,
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mode: string }>
}): Promise<Metadata> {
  const { mode } = await params
  return {
    title: `slot ${mode} title`,
    weight: weights[mode],
  }
}

export async function generateViewport({
  params,
}: {
  params: Promise<{ mode: string }>
}): Promise<Viewport> {
  const { mode } = await params
  return {
    colorScheme: 'light',
    weight: mode === 'viewport-positive' ? 1 : undefined,
  }
}

export default function Page() {
  return <p>metadata weight slot</p>
}
