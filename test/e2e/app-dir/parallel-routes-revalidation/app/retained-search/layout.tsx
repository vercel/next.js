import Link from 'next/link'
import { Suspense } from 'react'
import { RefreshButton } from '../components/RefreshButton'

export default function Layout({
  children,
  side,
}: {
  children: React.ReactNode
  side: React.ReactNode
}) {
  return (
    <>
      <Link prefetch={false} href="/retained-search/two?value=second">
        Two
      </Link>
      <Link prefetch={false} href="/retained-search/three?value=third">
        Three
      </Link>
      <RefreshButton />
      {children}
      <Suspense fallback={null}>{side}</Suspense>
    </>
  )
}
