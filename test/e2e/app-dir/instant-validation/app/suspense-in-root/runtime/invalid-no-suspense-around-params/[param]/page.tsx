import { connection } from 'next/server'
import { Suspense } from 'react'

export const instant = {
  level: 'experimental-error',
  unstable_samples: [{ cookies: [], params: { param: '123' } }],
}
export const prefetch = 'allow-runtime'

export default async function Page({
  params,
}: {
  params: Promise<{ param: string }>
}) {
  return (
    <main>
      <div>
        <p>
          Params need a suspense boundary even with "allow-runtime", because we
          need a valid App Shell
        </p>
        <LinkData params={params} />
      </div>

      <div>
        <p>But dynamic content does:</p>
        <Suspense fallback={<div>Loading...</div>}>
          <Dynamic />
        </Suspense>
      </div>
    </main>
  )
}

async function LinkData({ params }: { params: Promise<{ param: string }> }) {
  const { param } = await params
  return <div id="runtime-content">Param value: {param}</div>
}

async function Dynamic() {
  await connection()
  return <div id="dynamic-content">Dynamic content from page</div>
}
