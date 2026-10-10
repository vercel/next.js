import Link from 'next/link'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>
}) {
  if ((await searchParams).show !== '1') {
    return (
      <Link id="reveal-server-graph" href="?show=1" prefetch={false}>
        reveal server graph
      </Link>
    )
  }

  const { LazyServerContent } = await import('./lazy-server-content')

  return <LazyServerContent />
}
