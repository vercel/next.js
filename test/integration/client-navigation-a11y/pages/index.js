import Link from 'next/link'

export default () => (
  <div id="page-container">
    <Link href="/page-with-h1-and-title">
      <a id="page-with-h1-and-title-link">
        Go to a page with a title and an h1
      </a>
    </Link>

    <Link href="/page-with-h1">
      <a id="page-with-h1-link">Go to a page without a title but with an h1</a>
    </Link>

    <Link href="/page-with-title">
      <a id="page-with-title-link">
        Go to a page without an h1, but with a title
      </a>
    </Link>

    <Link href="/page-without-h1-or-title">
      <a id="page-without-h1-or-title-link">
        Go to a page without an h1 or a title
      </a>
    </Link>
  </div>
)
