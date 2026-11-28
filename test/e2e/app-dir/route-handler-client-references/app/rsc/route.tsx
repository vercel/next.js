import { renderToReadableStream } from 'react-server-dom-webpack/server'
import { getClientReferenceManifest } from 'next/dist/server/app-render/manifests-singleton'
import { Counter } from '../counter'

export const dynamic = 'force-dynamic'

// Renders a Flight payload that contains a client component, which only works
// if the Route Handler's client reference manifest lists that component.
export async function GET() {
  const stream = renderToReadableStream(
    <section id="from-route">
      <Counter />
    </section>,
    getClientReferenceManifest().clientModules
  )
  return new Response(stream, {
    headers: { 'content-type': 'text/x-component' },
  })
}
