export const dynamic = 'force-dynamic'

import Link from 'next/link'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav style={{ border: '1px solid #1f2937' }}>
        <ul style={{ display: 'flex' }}>
          <li style={{ marginRight: '1.5rem' }}>
            <Link href="/prefetch-auto-route-groups">Dashboard</Link>
          </li>
          <li style={{ marginRight: '1.5rem' }}>
            <Link href="/prefetch-auto-route-groups/sub/foo">Foo</Link>
          </li>
          <li style={{ marginRight: '1.5rem' }}>
            <Link href="/prefetch-auto-route-groups/sub/bar">Bar</Link>
          </li>
        </ul>
      </nav>
      {children}
    </>
  )
}
