import { connection } from 'next/server'
import { Suspense } from 'react'

export function generateStaticParams() {
  // The short entry requires a partial shell. The long entry also makes bottom
  // prerenderable on demand.
  return [{ top: 'short' }, { top: 'long', bottom: 'example' }]
}

export default function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  return (
    <>
      <Suspense fallback={<div id="bottom-fallback">loading bottom...</div>}>
        <Bottom params={params} />
      </Suspense>
      <Suspense fallback={<div id="dynamic-fallback">loading dynamic...</div>}>
        <Dynamic />
      </Suspense>
    </>
  )
}

async function Bottom({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { bottom } = await params
  return <div id="bottom">{bottom}</div>
}

async function Dynamic() {
  await connection()
  return <div id="dynamic">Dynamic content</div>
}
