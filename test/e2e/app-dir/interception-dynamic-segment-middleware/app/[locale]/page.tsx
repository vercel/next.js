import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <Link href="/foo/p/1">Foo</Link> <Link href="/foo/p/1">Foo</Link>
    </div>
  )
}
