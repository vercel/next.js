import { cookies } from 'next/headers'
import { connection } from 'next/server'

export default async function Page() {
  return (
    <main>
      <p>
        This page doesn't wrap runtime/dynamic components in suspense, but it
        has a loading.tsx, so these are fine.
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
