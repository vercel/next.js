import Link from 'next/link'

export default function NestedInnerPage() {
  return (
    <>
      <div id="nested-inner-page">Nested inner page</div>
      {/* Not prefetched, so that a test can assert that navigating here costs
          no network requests at all. */}
      <Link href="/" prefetch={false}>
        Back to home
      </Link>
    </>
  )
}
