export const dynamic = 'force-dynamic'

import Link from 'next/link'

export default function Layout({ children }) {
  return (
    <>
      <div>
        <Link href="/force-dynamic-loading">Root</Link>
      </div>
      <div>
        <Link href="/force-dynamic-loading/sub-page">Sub-Page</Link>
      </div>
      <div>
        <Link href="/force-dynamic-loading/sub-page-2">Sub-Page 2</Link>
      </div>
      {children}
    </>
  )
}
