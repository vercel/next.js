import Link from 'next/link'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  return { title: `Results for ${q}` }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  return (
    <main>
      <h1>Results for {q}</h1>
      <nav>
        <Link href="/search?q=alpha">alpha</Link>{' '}
        <Link href="/search?q=beta">beta</Link>{' '}
        <Link href="/search?q=gamma" prefetch={false}>
          gamma
        </Link>
      </nav>
    </main>
  )
}
