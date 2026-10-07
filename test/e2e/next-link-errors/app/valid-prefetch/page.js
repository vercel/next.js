import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function Hello() {
  return (
    <>
      <Link prefetch="prefetch" href="/invalid-href">
        Link with `prefetch="prefetch"`
      </Link>
      <Link prefetch="navigation" href="/invalid-href">
        Link with `prefetch="navigation"`
      </Link>
    </>
  )
}
