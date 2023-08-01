import Link from 'next/link'

export default function Page() {
  return (
    <>
      <h1 id="homepage">Home</h1>
      <div>
        <Link href="/trigger-404" id="trigger-404-link">
          Navigate to trigger-404 page
        </Link>
      </div>
      <div>
        <Link href="/testabc" id="non-existent-link">
          Navigate to non-existent page
        </Link>
      </div>
    </>
  )
}
