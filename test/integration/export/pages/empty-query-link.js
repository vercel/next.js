import Link from 'next/link'

export default () => (
  <div id="empty-query-link-page">
    <Link href="/hello?">
      <a id="empty-query-link">Empty Query link</a>
    </Link>
  </div>
)
