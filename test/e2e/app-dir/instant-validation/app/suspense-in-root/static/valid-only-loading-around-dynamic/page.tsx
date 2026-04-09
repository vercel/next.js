import { cookies } from 'next/headers'
import { connection } from 'next/server'

export const unstable_instant = {
  prefetch: 'static',
  samples: [{ cookies: [] }],
}

export default async function Page() {
  return (
    <main>
      <p>
        This page doesn't wrap runtime/dynamic components in suspense, but it
        has a loading.tsx. a self-navigation with a different search param value
        would block, but we accept that.
      </p>
      <div>
        <Runtime />
      </div>
      <div>
        <Dynamic />
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
