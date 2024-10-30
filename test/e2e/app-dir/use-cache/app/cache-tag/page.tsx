import React from 'react'
import { unstable_cacheTag as cacheTag } from 'next/cache'
import { RevalidateButtons } from './button'

async function getCachedWithTag(tag: string) {
  'use cache'
  cacheTag(tag, 'c')

  const response = await fetch(
    `https://next-data-api-endpoint.vercel.app/api/random?tag=${tag}`
  )

  return response.text()
}

export default async function Page() {
  const x = await getCachedWithTag('a')
  const y = await getCachedWithTag('b')

  return (
    <div>
      <p id="x">{x}</p>
      <br />
      <p id="y">{y}</p>
      <br />
      <RevalidateButtons />
    </div>
  )
}
