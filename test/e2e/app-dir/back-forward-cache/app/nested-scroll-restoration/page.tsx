import Link from 'next/link'

export default function Page() {
  return (
    <div
      id="nested-scroll-container"
      style={{ height: 300, overflowY: 'auto' }}
    >
      <Link
        id="nested-scroll-detail-link"
        href="/nested-scroll-restoration/detail"
        style={{ position: 'sticky', top: 0 }}
      >
        Open detail
      </Link>
      <div style={{ height: 2000 }} />
    </div>
  )
}
