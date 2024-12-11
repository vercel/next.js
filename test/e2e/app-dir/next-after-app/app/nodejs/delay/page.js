import { Suspense } from 'react'
import { after } from 'next/server'
import { cliLog } from '../../../utils/log'

export const dynamic = 'force-dynamic'

export default async function Page() {
  after(() => {
    cliLog({ source: '[page] /delay (Page)' })
  })
  return (
    <Suspense fallback={'Loading...'}>
      <Inner>Delay</Inner>
    </Suspense>
  )
}

async function Inner({ children }) {
  after(() => {
    cliLog({ source: '[page] /delay (Inner)' })
  })

  // the test intercepts this to assert on whether the after() callbacks ran
  // before and after we finish handling the request.
  await fetch('https://example.test/delayed-request', {
    signal: AbortSignal.timeout(10_000),
  })

  return <>{children}</>
}
