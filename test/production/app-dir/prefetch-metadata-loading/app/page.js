import Link from 'next/link'

// This page will only initiate one prefetch request for the target page
export default function Page() {
  return (
    <main>
      <Link id="metadata-prefetch" href="/metadata-prefetch">
        Metadata with prefetch
      </Link>
      <br />
    </main>
  )
}
