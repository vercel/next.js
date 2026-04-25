import { cookies } from 'next/headers'
import { connection } from 'next/server'

export const unstable_instant = true

export default async function Page() {
  return (
    <main>
      <p>
        This page doesn't wrap runtime/dynamic components in suspense, but it
        has a loading.tsx above it. However, the page is inside a route group
        and the loading.tsx is on the parent URL segment. Validation considers
        the route group as a potential shared boundary where the loading.tsx
        Suspense would already be revealed. In a more advanced system we would
        analyze siblings of the route group to determine if such a navigation is
        actually possible, but for now we conservatively report an error.
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
