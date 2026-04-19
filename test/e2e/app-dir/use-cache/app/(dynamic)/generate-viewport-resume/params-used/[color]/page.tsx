import { Viewport } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'

export async function generateViewport({
  params,
}: {
  params: Promise<{ color: string }>
}): Promise<Viewport> {
  'use cache: remote'

  // Use `eval` to side step compiler errors for using `arguments` in a 'use
  // cache' function.
  // eslint-disable-next-line no-eval
  const unusedParentArg = eval('arguments')[1]
  if (unusedParentArg !== undefined) {
    throw new Error(
      'Expected the unused parent argument to be omitted. Received: ' +
        unusedParentArg
    )
  }

  // We're reading params here. This makes the cache function dynamic during
  // prerendering. It also requires suspense above body, so nothing will
  // prerendered. The meta tag should still be cached on refreshes though.
  const { color } = await params

  return { themeColor: color, initialScale: Math.random() }
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Dynamic />
    </Suspense>
  )
}

async function Dynamic() {
  await connection()

  return <p>Dynamic</p>
}
