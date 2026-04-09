import Link from 'next/link'
import { lazy } from 'react'

const LazyComponent = lazy(() => import('./_client'))

export default function Page() {
  return (
    <>
      <Link href="/about" legacyBehavior passHref>
        <LazyComponent>About</LazyComponent>
      </Link>
    </>
  )
}
