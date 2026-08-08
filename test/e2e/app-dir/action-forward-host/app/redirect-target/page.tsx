import { Suspense } from 'react'
import { headers } from 'next/headers'

async function Host() {
  const headerList = await headers()
  const host = headerList.get('host')

  console.log(
    `[redirectTarget]` +
      JSON.stringify({
        host,
        xForwardedHost: headerList.get('x-forwarded-host'),
        actionForwarded: headerList.get('x-action-forwarded'),
        actionRedirectForwarded: headerList.get('x-action-redirect-forwarded'),
      })
  )

  return <main id="redirect-target">{host}</main>
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Host />
    </Suspense>
  )
}
