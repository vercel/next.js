import React from 'react'
import { setTimeout } from 'timers/promises'

async function fetchUncachedData() {
  await setTimeout(0)

  return Math.random()
}

const Foo = async ({ promise }) => {
  'use cache'

  return (
    <>
      <p>{await promise}</p>
      <p>{Math.random()}</p>
    </>
  )
}

export default async function Page() {
  return <Foo promise={fetchUncachedData()} />
}
