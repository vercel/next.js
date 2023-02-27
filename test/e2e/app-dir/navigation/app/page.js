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
      <Link id="to-client-redirect" href="/redirect/clientcomponent">
        To client redirect
      </Link>
      <Link id="to-server-redirect" href="/redirect/servercomponent">
        To server redirect
      </Link>
      <Link id="to-client-not-found" href="/not-found/clientcomponent">
        To client not found
      </Link>
      <Link id="to-server-not-found" href="/not-found/servercomponent">
        To server not found
      </Link>
      <div id="query">{params.toString()}</div>
    </>
  )
}
