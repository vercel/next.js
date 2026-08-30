import { Suspense } from 'react'
import { headers } from 'next/headers'
import { cliLog } from '../../../../utils/log'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <Suspense fallback="Loading...">
      <RequestApiAfterClose />
    </Suspense>
  )
}

async function RequestApiAfterClose() {
  cliLog({ source: '[page] /interrupted/request-api-after-close (waiting)' })
  await new Promise((resolve) => setTimeout(resolve, 1_000))

  const requestHeaders = await headers()
  return <p>{requestHeaders.get('host')}</p>
}
