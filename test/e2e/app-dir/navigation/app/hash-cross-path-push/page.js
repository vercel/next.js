import Link from 'next/link'

export default function Page() {
  return (
    <>
      <h1>Start</h1>
      {/* Not prefetched: a prefetched route entry is hashless by construction,
          which hides the doubling this route exists to catch. */}
      <Link
        href="/hash-cross-path-push/destination#foo"
        id="link-to-target-foo"
        prefetch={false}
      >
        Link to destination#foo
      </Link>
    </>
  )
}
