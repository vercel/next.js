'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

export default function Page() {
  const params = useSearchParams()
  return (
    <>
      <Link id="set-query" href="/?a=b&c=d">
        set Query
      </Link>
      <div id="query">{params.toString()}</div>
    </>
  )
}
