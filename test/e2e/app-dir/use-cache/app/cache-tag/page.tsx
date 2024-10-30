import React from 'react'
import { unstable_cacheTag as cacheTag } from 'next/cache'
import { RevalidateButtons } from './button'

async function getCachedWithTag(tag) {
  'use cache'
  cacheTag(tag, 'c')
  return Math.random()
}

export default async function Page() {
  const x = await getCachedWithTag('a')
  const y = await getCachedWithTag('b')
  return (
    <p>
      <p id="x">{x}</p>
      <br />
      <p id="y">{y}</p>
      <br />
      <RevalidateButtons />
    </p>
  )
}
