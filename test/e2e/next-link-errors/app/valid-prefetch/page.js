import Link from 'next/link'

export default function Hello() {
  return (
    <>
      <Link prefetch="prefetch" href="/valid-prefetch">
        Link with `prefetch="prefetch"`
      </Link>
      <Link prefetch="navigation" href="/valid-prefetch">
        Link with `prefetch="navigation"`
      </Link>
    </>
  )
}
