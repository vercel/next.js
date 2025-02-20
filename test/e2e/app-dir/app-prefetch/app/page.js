import Link from 'next/link'
export default function HomePage() {
  return (
    <>
      <Link href="/dashboard" id="to-dashboard">
        To Dashboard
      </Link>
      <Link href="/static-page" id="to-static-page">
        To Static Page
      </Link>
      <Link href="/dynamic-page" id="to-dynamic-page-no-params">
        To Dynamic Page
      </Link>
      <Link href="/prefetch-auto/foobar" id="to-dynamic-page">
        To Dynamic Slug Page
      </Link>
      <a href="/static-page" id="to-static-page-hard">
        Hard Nav to Static Page
      </a>
    </>
  )
}
