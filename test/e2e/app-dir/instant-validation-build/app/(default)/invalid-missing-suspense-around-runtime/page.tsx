import { cookies } from 'next/headers'
import { connection } from 'next/server'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [{ name: 'auth', value: '1' }] }],
}
export const unstable_prefetch = 'runtime'

export default async function Page() {
  const c = await cookies()
  return (
    <main>
      <p>
        This page reads cookies outside Suspense, so it should fail validation
        because it would block navigation.
      </p>
      <div id="runtime-content">cookie: {c.get('auth')?.value}</div>
      <Dynamic />
    </main>
  )
}

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Dynamic content</div>
}
