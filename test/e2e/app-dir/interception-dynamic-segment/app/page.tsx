import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <Link href="/foo/1">Foo</Link> <Link href="/bar/1">Foo</Link>
    </div>
  )
}
