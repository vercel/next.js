import { cookies } from 'next/headers'
import { connection } from 'next/server'

export const unstable_instant = { prefetch: 'static' }

export default async function Page() {
  return (
    <main>
      <p>
        This page doesn't wrap runtime/dynamic components in suspense, so
        despite having a loading.tsx (which is equivalent to a suspense boundary
        in a parent layout), it shouldn't pass validation, because a
        self-navigation would block.
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
  await new Promise((resolve) => setTimeout(resolve, 1000))
  await connection()
  return <div id="dynamic-content">Dynamic content from page</div>
}
