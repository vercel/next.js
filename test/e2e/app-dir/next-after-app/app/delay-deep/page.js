import { Suspense } from 'react'
import { unstable_after as after } from 'next/server'
import { cliLog } from '../../utils/log'
import { sleep } from '../../utils/sleep'

// don't waste time prerendering, after() will bail out anyway
export const dynamic = 'force-dynamic'

export default async function Page() {
  cliLog({ source: '[page] /delay-deep (Page) - render' })
  return (
    <Suspense fallback={'Loading...'}>
      <Inner>Delay</Inner>
    </Suspense>
  )
}

async function Inner({ children }) {
  cliLog({
    source: '[page] /delay-deep (Inner) - render, sleeping',
  })

  await sleep(1000)

  cliLog({
    source: '[page] /delay-deep (Inner) - render, done sleeping',
  })

  return (
    <div>
      <Suspense fallback="Loading 2...">
        <Inner2>{children}</Inner2>
      </Suspense>
    </div>
  )
}

async function Inner2({ children }) {
  cliLog({
    source: '[page] /delay-deep (Inner2) - render, sleeping',
  })

  await sleep(1000)

  cliLog({
    source: '[page] /delay-deep (Inner2) - render, done sleeping',
  })

  after(async () => {
    await sleep(1000)
    cliLog({ source: '[page] /delay-deep (Inner2) - after' })
  })

  return <>{children}</>
}
