import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <Link href="/cache/foo">foo</Link>
      <Link prefetch={false} href="/cache/bar">
        bar
      </Link>
    </div>
  )
}
