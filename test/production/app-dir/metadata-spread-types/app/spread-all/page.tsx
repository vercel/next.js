import type { Metadata, ResolvingMetadata } from 'next'

export async function generateMetadata(
  _: unknown,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const parentMeta = await parent

  return { ...parentMeta, title: 'Spread all page' }
}

export default function Page() {
  return (
    <div>
      <h1>Spread all page</h1>
      <p>This page spreads the entire parent metadata</p>
    </div>
  )
}
