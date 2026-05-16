import Link from 'next/link'

export function Nav() {
  return (
    <nav>
      <Link href="/pages/a" prefetch={false}>
        Go to A
      </Link>
      <Link href="/pages/b" prefetch={false}>
        Go to B
      </Link>
      <Link href="/app/a" prefetch={false}>
        Go to A
      </Link>
      <Link href="/app/b" prefetch={false}>
        Go to B
      </Link>
      <Link href="/app/client-a" prefetch={false}>
        Go to A
      </Link>
      <Link href="/app/client-b" prefetch={false}>
        Go to B
      </Link>
    </nav>
  )
}
