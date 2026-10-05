import { connection } from 'next/server'
import { Suspense } from 'react'

export default function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  return (
    <>
      <div id="bottom-boundary">
        <Suspense fallback={<p>Loading bottom...</p>}>
          <Bottom params={params} />
        </Suspense>
      </div>
      <div id="connection-boundary">
        <Suspense fallback={<p>Loading connection...</p>}>
          <DynamicContent />
        </Suspense>
      </div>
    </>
  )
}

async function Bottom({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { bottom } = await params
  return <p id="bottom">Bottom: {bottom}</p>
}

async function DynamicContent() {
  await connection()
  return <p id="dynamic-content">Dynamic content</p>
}
