import { Suspense } from 'react'
import { connection } from 'next/server'
import { RenderStamp } from './render-stamp'

// Reading the connection makes this page dynamic, so a refresh() always
// re-renders on the server (and produces a new stamp), in production mode as
// well as development. Unlike the `dynamic = 'force-dynamic'` segment config
// this is also allowed when Cache Components is enabled, where the
// `<Suspense>` boundary lets the rest of the page prerender as a shell.
async function DynamicStamp() {
  await connection()
  return <RenderStamp stamp={Date.now()} />
}

export default function Page() {
  return (
    <>
      <h1 id="no-prefetch">No prefetch</h1>
      <Suspense fallback={null}>
        <DynamicStamp />
      </Suspense>
    </>
  )
}
