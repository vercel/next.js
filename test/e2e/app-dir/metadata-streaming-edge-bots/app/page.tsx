import type { Metadata } from 'next'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  // Simulate slow metadata so the shell can flush before it resolves.
  await new Promise((resolve) => setTimeout(resolve, 1000))

  return {
    title: 'Edge metadata title',
    description: 'Edge metadata description',
    openGraph: {
      title: 'Edge Open Graph title',
      description: 'Edge Open Graph description',
    },
  }
}

export default function Page() {
  return <p>Edge SSR metadata streaming</p>
}
