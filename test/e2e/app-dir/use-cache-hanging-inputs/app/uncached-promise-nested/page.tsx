import React from 'react'
import { setTimeout } from 'timers/promises'

async function getUncachedData() {
  await setTimeout(0)

  return Math.random()
}

const getCachedData = async (promise: Promise<number>) => {
  'use cache'

  return await promise
}

async function indirection(promise: Promise<number>) {
  'use cache'

  return getCachedData(promise)
}

export default async function Page() {
  const data = await indirection(getUncachedData())

  return <p>{data}</p>
}
