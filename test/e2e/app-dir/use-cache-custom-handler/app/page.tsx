import { Suspense } from 'react'
import {
  unstable_cacheLife as cacheLife,
  unstable_cacheTag as cacheTag,
  revalidatePath,
  revalidateTag,
} from 'next/cache'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import React from 'react'

async function getData() {
  'use cache'

  cacheLife({ revalidate: 3 })
  cacheTag('modern')

  return new Date().toISOString()
}

async function AsyncComp() {
  let data = await getData()

  return <p id="data">{data}</p>
}

export default async function Home() {
  await connection()

  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <AsyncComp />
      </Suspense>
      <form>
        <button
          id="revalidate-tag"
          formAction={async () => {
            'use server'

            revalidateTag('modern')
          }}
        >
          Revalidate Tag
        </button>{' '}
        <button
          id="revalidate-path"
          formAction={async () => {
            'use server'

            revalidatePath('/')
          }}
        >
          Revalidate Path
        </button>{' '}
        <button
          id="revalidate-redirect"
          formAction={async () => {
            'use server'

            revalidateTag('modern')
            redirect('/')
          }}
        >
          Revalidate Tag & Redirect
        </button>
      </form>
    </main>
  )
}
