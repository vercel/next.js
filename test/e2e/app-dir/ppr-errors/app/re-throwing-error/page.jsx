import React, { Suspense } from 'react'
import { cookies } from 'next/headers'

export default async function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Foobar />
    </Suspense>
  )
}

async function Foobar() {
  try {
    await cookies()
  } catch (err) {
    throw new Error('The original error was caught and rethrown.')
  }
  return null
}
