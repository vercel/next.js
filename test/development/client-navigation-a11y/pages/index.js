import Link from 'next/link'

export default () => (
  <div id="page-container">
    <Link href="/page-with-h1-and-title" id="page-with-h1-and-title-link">
      Go to a page with a title and an h1
    </Link>

    <Link href="/page-with-h1" id="page-with-h1-link">
      Go to a page without a title but with an h1
    </Link>

    <Link href="/page-with-title" id="page-with-title-link">
      Go to a page without an h1, but with a title
    </Link>

    <Link href="/page-without-h1-or-title" id="page-without-h1-or-title-link">
      Go to a page without an h1 or a title
    </Link>
  </div>
)
