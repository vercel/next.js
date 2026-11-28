import Link from 'next/link'
import { Suspense } from 'react'
import { RefreshButton } from '../components/RefreshButton'
import { ReplaceStateButton } from '../components/ReplaceStateButton'

export default function Layout({
  children,
  side,
}: {
  children: React.ReactNode
  side: React.ReactNode
}) {
  return (
    <>
      <Link prefetch={false} href="/prr/retained-search/two?value=second">
        Two
      </Link>
      <Link prefetch={false} href="/prr/retained-search/three?value=third">
        Three
      </Link>
      <RefreshButton />
      {/* Used by the history.replaceState regression test */}
      <ReplaceStateButton searchParams="?value=replaced" />
      {children}
      <Suspense fallback={null}>{side}</Suspense>
    </>
  )
}
