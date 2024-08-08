import Link from 'next/link'
import { unstable_after as after } from 'next/server'
import React from 'react'
import { fetchRandomValue } from '../lib/fetch-random-value'
import { RefreshButton } from './refresh-button'

export async function SharedPage({ runtime }: { runtime: string }) {
  const value = await fetchRandomValue(`render-${runtime}`)

  // FIXME(lubieowoce): reenable this when after() is fixed in edge runtime
  // (disabling it like this makes tests that don't care about `after()` work,
  //  and the tests that do care about it will look for logs, so they'll fail anyway)
  if (process.env.NEXT_RUNTIME !== 'edge') {
    after(async () => {
      const value = await fetchRandomValue(`after-${runtime}`)
      console.log('After:', value)
    })
  }

  return (
    <>
      <h1>{runtime}</h1>
      <p id="content">foo</p>
      <p id="value">{value}</p>
      <p>
        <Link href="/">back to root</Link>
      </p>
      <p>
        <RefreshButton />
      </p>
    </>
  )
}
