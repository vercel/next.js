import Link from 'next/link'
import { unstable_after as after } from 'next/server'
import React from 'react'
import { fetchRandomValue } from '../lib/fetch-random-value'
import { RefreshButton } from './refresh-button'

export async function Page() {
  const value = await fetchRandomValue('render')

  after(async () => {
    const value = await fetchRandomValue('after')
    console.log('After:', value)
  })

  return (
    <>
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
