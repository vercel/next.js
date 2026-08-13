import Link from 'next/link'

export function generateStaticParams() {
  return [{ slug: 'first' }]
}

export default async function DynamicPage({ params }) {
  const { slug } = await params
  return (
    <>
      {/* One interpolated string rather than `Dynamic page: {slug}`, so the text
          survives into the Flight payload as a single string a test can match
          on. Separate JSX children arrive as separate strings. */}
      <div id="dynamic-page">{`Dynamic page: ${slug}`}</div>
      {/* Not prefetched, so that a test can assert that navigating here costs
          no network requests at all. */}
      <Link href="/" prefetch={false}>
        Back to home
      </Link>
    </>
  )
}
