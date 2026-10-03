import { connection } from 'next/server'
import { Suspense } from 'react'
import { LinkAccordion } from '../../components/link-accordion'
import { HashControls } from '../hash-controls'

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  await connection()
  const { slug } = await params

  // slug === "a" means we're at / (the proxy rewrites / -> /a).
  const isHome = slug === 'a'

  return (
    <main>
      <h1 id="page">{`slug: ${slug}`}</h1>
      {isHome ? (
        <p id="home">home</p>
      ) : (
        <LinkAccordion href="/a#modal" prefetch={false}>
          Go to /a#modal
        </LinkAccordion>
      )}
      <HashControls />
    </main>
  )
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<div id="loading">Loading...</div>}>
      <Content params={params} />
    </Suspense>
  )
}
