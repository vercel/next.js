import { connection } from 'next/server'
import React from 'react'

async function fetchUncachedData() {
  await connection()

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
