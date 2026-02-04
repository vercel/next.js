import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/about" legacyBehavior>
        About
      </Link>
    </>
  )
}
