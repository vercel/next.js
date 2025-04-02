import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <Link href="/catch-all/1">To Test Page</Link>
      <Link href="/search-params?delay=1000">To Search Params Page</Link>
    </div>
  )
}
