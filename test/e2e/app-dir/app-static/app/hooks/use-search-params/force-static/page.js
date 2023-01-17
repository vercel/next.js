export const dynamic = 'force-static'

import Link from 'next/link'
import { Suspense } from 'react'
import UseSearchParams from '../search-params'

export default function Page() {
  return (
    <Suspense fallback={<p>search params suspense</p>}>
      <UseSearchParams />
      <Link
        id="to-use-search-params"
        href="/hooks/use-search-params?first=1&second=2&third=3"
      >
        To /
      </Link>
    </Suspense>
  )
}
