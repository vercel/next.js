import { Suspense } from 'react'

type Params = Promise<{ lang: string; top: string; bottom: string }>

async function Content({ params }: { params: Params }) {
  const { lang, top, bottom } = await params
  return <p id="params">{`${lang}/${top}/${bottom}`}</p>
}

export function CatalogPage({ params }: { params: Params }) {
  return (
    <main id="catalog-page">
      <h1>Catalog</h1>
      <p id="generation">{performance.now().toFixed(5)}</p>
      <Suspense fallback={<p id="pending">Loading catalog</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  )
}
