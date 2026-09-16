import Link from 'next/link'

export default function Page() {
  return (
    <>
      <h1>Hub</h1>
      <Link href="/" prefetch={false}>
        Return to cached content
      </Link>
    </>
  )
}
