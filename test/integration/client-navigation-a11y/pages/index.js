import Link from 'next/link'

export default () => (
  <>
    <Link href="/with-h1">
      <a id="with-h1-link">With h1 element</a>
    </Link>
    <Link href="/with-h1-and-tab-index">
      <a id="with-h1-and-tab-index-link">
        With h1 element that has a tab index
      </a>
    </Link>
    <Link href="/with-main">
      <a id="with-main-link">With main element</a>
    </Link>
    <Link href="/without-main">
      <a id="without-main-link">Without main element</a>
    </Link>
  </>
)
