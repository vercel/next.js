import Link from 'next/link'

// This page will not initiate any prefetch request for the target page
export default function Page() {
  return (
    <main>
      <Link
        id="metadata-without-prefetch"
        prefetch={false}
        href="/metadata-without-prefetch"
      >
        Metadata without prefetch
      </Link>
      <br />
      <Link
        id="default-without-prefetch"
        prefetch={false}
        href="/default-without-prefetch"
      >
        Default without prefetch
      </Link>
      <br />
    </main>
  )
}
