import Link from 'next/link'

export default function Page() {
  return (
    <>
      <h1>Target</h1>
      <Link
        href="/hash-cross-path-push/destination#baz"
        id="link-to-target-baz"
      >
        Link to destination#baz
      </Link>
    </>
  )
}
