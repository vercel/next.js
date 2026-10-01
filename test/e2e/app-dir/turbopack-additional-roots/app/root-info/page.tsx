import { connection } from 'next/server'
import { Suspense } from 'react'
import { moduleUrl } from '../../linked/root-info.mjs'
import Client from './client'

// Rendered at request time, so the URL reflects the server running the page
// rather than the build.
async function ServerRootInfo() {
  await connection()
  return <pre id="server-root-info">{JSON.stringify({ url: moduleUrl })}</pre>
}

export default function Page() {
  return (
    <>
      <Suspense>
        <ServerRootInfo />
      </Suspense>
      <Client />
    </>
  )
}
