import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function Hello() {
  return (
    <Link prefetch="unknown" href="https://nextjs.org/">
      Link with unknown `prefetch` renders in prod.
    </Link>
  )
}
