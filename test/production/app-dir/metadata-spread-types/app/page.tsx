import type { Metadata, ResolvingMetadata } from 'next'

export default function Page() {
  return <p>Spread parent metadata test</p>
}

export async function generateMetadata(
  _: unknown,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParent = await parent

  return {
    title: 'Page title',
    description: 'Page description',
    openGraph: {
      ...resolvedParent.openGraph,
      title: 'Page OG title',
      description: 'Page OG description',
    },
    twitter: {
      ...resolvedParent.twitter,
      title: 'Page Twitter title',
      description: 'Page Twitter description',
    },
  }
}
