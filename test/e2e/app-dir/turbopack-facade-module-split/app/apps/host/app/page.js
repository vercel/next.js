import { Suspense } from 'react'
import { headers } from 'next/headers'
import { InstallShared } from './install-shared'
import { SingletonDisplay } from './singleton-display'

export default function Home() {
  return (
    <>
      <SingletonDisplay />
      <Suspense fallback={null}>
        <RemoteLoader />
      </Suspense>
    </>
  )
}

// Mirrors remote-components' fetchRemoteComponent (src/internal/host/server/
// fetch-remote-component.ts): fetch the remote page and parse its client
// chunk URLs out of the HTML. No chunk is requested by this page beyond that.
async function RemoteLoader() {
  const host = (await headers()).get('host')
  const remotePage = await fetch(`http://${host}/remote-component/singleton`, {
    cache: 'no-store',
  }).then((res) => res.text())

  const scriptUrls = [
    ...new Set(
      [...remotePage.matchAll(/src="(\/remote-assets\/[^"]+\.js)"/g)]
        .map((m) => m[1])
        // Keep the remote runtime chunk out: without a runtime booting, the
        // pushed module tables stay in the chunk-loading global for the
        // scope loader to capture.
        .filter((url) => {
          const name = url.split('/').pop() ?? ''
          return !name.startsWith('turbopack-') && !name.startsWith('webpack-')
        })
    ),
  ]

  return <InstallShared scriptUrls={scriptUrls} />
}
