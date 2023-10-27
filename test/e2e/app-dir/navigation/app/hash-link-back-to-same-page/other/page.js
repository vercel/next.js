import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p>Other Page</p>
      <Link href="/hash-link-back-to-same-page" id="link-to-home">
        Back to test home
      </Link>
    </>
  )
}
