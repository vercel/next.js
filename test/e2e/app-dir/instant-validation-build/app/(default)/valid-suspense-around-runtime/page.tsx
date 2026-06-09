import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

export const unstable_instant = {
  level: 'experimental-error',
  unstable_samples: [{ cookies: [{ name: 'auth', value: '1' }] }],
}
export const prefetch = 'allow-runtime'

export default async function Page() {
  return (
    <main>
      <p>
        This page wraps all runtime/dynamic components in Suspense, so it should
        pass validation.
      </p>
      <Suspense fallback={<div>Loading...</div>}>
        <Runtime />
      </Suspense>
      <Suspense fallback={<div>Loading...</div>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Runtime() {
  const c = await cookies()
  return <div id="runtime-content">cookie: {c.get('auth')?.value}</div>
}

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Dynamic content</div>
}
