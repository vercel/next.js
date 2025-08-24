import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function Index() {
  return (
    <Link href="/" legacyBehavior>
      <p>Hello</p>
      <p>Dave!</p>
    </Link>
  )
}
