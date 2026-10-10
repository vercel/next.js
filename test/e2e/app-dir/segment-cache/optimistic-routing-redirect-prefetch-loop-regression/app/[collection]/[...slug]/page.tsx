import { connection } from 'next/server'
import { Suspense } from 'react'
import { LinkAccordion } from '../../../components/link-accordion'
import { PrefetchButton } from '../../../components/prefetch-button'

type Params = Promise<{ collection: string; slug: string[] }>

// A sidebar of links under the same route, like the reported site.
const SIDEBAR = ['beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta']

// A static shell with one dynamic hole, so a full prefetch of a page under
// this route needs a runtime request rather than just the static segment data.
export default function DocsPage({ params }: { params: Params }) {
  return (
    <>
      <h1>A page under [collection]/[...slug]</h1>
      <Suspense fallback={<p>Loading docs...</p>}>
        <Body params={params} />
      </Suspense>
      <ul>
        {SIDEBAR.map((slug) => (
          <li key={slug}>
            <LinkAccordion href={`/docs/${slug}`}>/docs/{slug}</LinkAccordion>
          </li>
        ))}
      </ul>
      <PrefetchButton href="/docs/changelog" />
    </>
  )
}

async function Body({ params }: { params: Params }) {
  const { collection, slug } = await params
  await connection()
  return (
    <p id="docs-params">
      {collection}/{slug.join('/')}
    </p>
  )
}
