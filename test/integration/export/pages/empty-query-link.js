import Link from 'next/link'

const EmptyQueryLink = () => (
  <div id="empty-query-link-page">
    <Link href="/hello?">
      <a id="empty-query-link">Empty Query link</a>
    </Link>
  </div>
)

export default EmptyQueryLink
