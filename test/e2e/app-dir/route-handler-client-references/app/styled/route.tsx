import { renderToReadableStream } from 'react-server-dom-webpack/server'
import { getClientReferenceManifest } from 'next/dist/server/app-render/manifests-singleton'
import { Counter } from '../counter'
import './styles.css'

export const dynamic = 'force-dynamic'

export async function GET() {
  const stream = renderToReadableStream(
    <section id="from-styled-route">
      <Counter />
    </section>,
    getClientReferenceManifest().clientModules
  )
  return new Response(stream, {
    headers: { 'content-type': 'text/x-component' },
  })
}
