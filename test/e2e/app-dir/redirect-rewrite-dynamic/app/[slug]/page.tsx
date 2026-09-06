import { connection } from 'next/server'
import { Suspense } from 'react'
import { LinkAccordion } from '../../components/link-accordion'

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  // Opt into dynamic rendering and read the `[slug]` param.
  await connection()
  const { slug } = await params

  // slug === "a" means we're at / (proxy rewrites / -> /a).
  const isHome = slug === 'a'

  return (
    <main>
      {/* Build the string in JS-land so the literal "slug: a" appears in the
          Flight response body (see router-act skill: JSX interpolation
          splits the string in the wire format). */}
      <h1 id="page" data-testid="page">{`slug: ${slug}`}</h1>

      {isHome ? (
        <p>
          This is the home page (<code>/</code>), served via a proxy rewrite
          from <code>/a</code>.
          <LinkAccordion href="/two" prefetch={false}>
            Go to /two
          </LinkAccordion>
        </p>
      ) : (
        <p>
          Click the link. The proxy redirects <code>/a</code> to <code>/</code>,
          so the URL should change to <code>/</code>.
          <LinkAccordion href="/a" prefetch={false}>
            Go to /a
          </LinkAccordion>
        </p>
      )}
    </main>
  )
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  // The dynamic data access (connection/params) lives inside a Suspense
  // boundary so the route can still be prerendered when cacheComponents is on.
  return (
    <Suspense fallback={<div id="loading">Loading...</div>}>
      <Content params={params} />
    </Suspense>
  )
}
