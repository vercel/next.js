import Link from 'next/link'

export default function StaticPage() {
  return (
    <>
      <h1 id="static-page-header">Static Page</h1>
      <Link href="/pages-router/dynamic-page" id="go-to-dynamic-page">
        Go to dynamic page
      </Link>
      <Link href="/pages-router/static-page-2" id="go-to-static-page">
        Go to static page
      </Link>
    </>
  )
}
