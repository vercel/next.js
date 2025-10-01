import { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
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
  // prerendering, and thus the title should be excluded from the partially
  // prerendered page.
  const { slug } = await params

  return { title: new Date().toISOString(), keywords: [slug] }
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
