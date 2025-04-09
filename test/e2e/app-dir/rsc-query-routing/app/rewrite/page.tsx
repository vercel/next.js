import Link from 'next/link'

export default function Home() {
  return (
    <div>
      {/* disable prefetch to align the dev/prod fetching behavior,
       it's easier for writing tests */}
      Go to{' '}
      <Link prefetch={false} href="/rewrite/source">
        Rewrite Link
      </Link>
    </div>
  )
}
