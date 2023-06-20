import Link from 'next/link'

export default () => (
  <div id="empty-hash-link-page">
    <Link href="/hello#" id="empty-hash-link">
      Empty Hash link
    </Link>
  </div>
)
