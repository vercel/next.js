import { connection } from 'next/server'
import React from 'react'

async function fetchUncachedData() {
  await connection()

  return Math.random()
}

export default async function Page() {
  const uncachedDataPromise = fetchUncachedData()

  const Foo = async () => {
    'use cache'

    return (
      <>
        <p>{await uncachedDataPromise}</p>
        <p>{Math.random()}</p>
      </>
    )
  }

  return <Foo />
}
