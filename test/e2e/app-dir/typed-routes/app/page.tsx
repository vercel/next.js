import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <p>hello world</p>
      <div>
        <Link href="/">Simple Route</Link>
        <Link href="/dashboard">Simple Route</Link>
        <Link href="/project/123">Dynamic Route</Link>
        <Link href="/gallery/photo/some-slug">Dynamic Route</Link>
        <Link href="/_shop/">Optional Catchall Route</Link>
        <Link href="/docs/some/thing">Catchall Route</Link>
        <Link href="/api-legacy/v1/testing">Rewrite Route</Link>
        <Link href="/blog/category/testing">Redirect Route</Link>
      </div>
    </div>
  )
}
