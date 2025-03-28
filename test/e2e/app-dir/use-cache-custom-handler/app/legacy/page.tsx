import { Suspense } from 'react'
import {
  unstable_cacheLife as cacheLife,
  unstable_cacheTag as cacheTag,
  revalidateTag,
} from 'next/cache'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import React from 'react'

async function getData() {
  'use cache: legacy'

  cacheLife({ revalidate: 3 })
  cacheTag('legacy')

  return new Date().toISOString()
}

async function AsyncComp() {
  let data = await getData()

  return <p id="data">{data}</p>
}

export default async function Legacy() {
  await connection()

  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <AsyncComp />
      </Suspense>
      <form
        action={async () => {
          'use server'

          revalidateTag('legacy')
          redirect('/legacy')
        }}
      >
        <button id="revalidate">Revalidate Tag</button>
      </form>
    </main>
  )
}
