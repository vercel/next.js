import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/about" legacyBehavior>
        {1000}
      </Link>
    </>
  )
}
