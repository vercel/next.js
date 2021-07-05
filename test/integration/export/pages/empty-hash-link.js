import Link from 'next/link'

const EmptyHashLink = () => (
  <div id="empty-hash-link-page">
    <Link href="/hello#">
      <a id="empty-hash-link">Empty Hash link</a>
    </Link>
  </div>
)

export default EmptyHashLink
