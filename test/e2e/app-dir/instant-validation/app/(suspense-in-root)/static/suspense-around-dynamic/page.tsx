import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

export const unstable_instant = { prefetch: 'static' }

export default async function Page() {
  return (
    <main>
      <p>
        This page wraps all runtime/dynamic components in suspense, so it
        wouldn't block a navigation and should pass validation.
      </p>
      <div>
        <p>Runtime content with a suspense boundary</p>
        <Suspense fallback={<div>Loading...</div>}>
          <Runtime />
        </Suspense>
      </div>

      <div>
        <p>Dynamic content with a suspense boundary</p>
        <Suspense fallback={<div>Loading...</div>}>
          <Dynamic />
        </Suspense>
      </div>
    </main>
  )
}

async function Runtime() {
  await cookies()
  return <div id="runtime-content">Runtime content from page</div>
}

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Dynamic content from page</div>
}
