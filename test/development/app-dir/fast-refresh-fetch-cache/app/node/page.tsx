import Link from 'next/link'
import React from 'react'
import { RefreshButton } from '../../components/refresh-button'
import { fetchRandomValue } from '../../lib/fetch-random-value'

export default async function Page() {
  const value = await fetchRandomValue()

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
