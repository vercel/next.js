import Link from 'next/link'
import { after } from 'next/server'
import React from 'react'
import { fetchRandomValue } from '../lib/fetch-random-value'
import { RefreshButton } from './refresh-button'

export async function SharedPage({ runtime }: { runtime: string }) {
  const value = await fetchRandomValue(`render-${runtime}`)

  after(async () => {
    const value = await fetchRandomValue(`after-${runtime}`)
    console.log('After:', value)
  })

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
