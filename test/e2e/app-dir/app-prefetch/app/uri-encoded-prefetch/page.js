import Link from 'next/link'

export default async function Page() {
  return (
    <>
      <p id="uri-encoded-prefetch">URI Encoded Prefetch</p>
      <p>
        <Link
          href="/?param=with%20space"
          id="prefetch-via-link"
          prefetch={true}
        >
          Prefetch Via Link
        </Link>
      </p>
    </>
  )
}
