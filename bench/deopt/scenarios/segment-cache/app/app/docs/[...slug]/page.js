import { Suspense } from 'react'

async function DocBody({ params }) {
  const { slug } = await params
  return (
    <>
      <h1>docs: {slug.join(' / ')}</h1>
      <p>Catch-all route with {slug.length} segments.</p>
    </>
  )
}

export default function DocsPage({ params }) {
  return (
    <main>
      <Suspense fallback={<p>loading docs…</p>}>
        <DocBody params={params} />
      </Suspense>
    </main>
  )
}
