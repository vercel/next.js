import { Suspense } from 'react'

export function generateStaticParams() {
  return [{ id: '1' }, { id: '2' }]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // Title lookup from the catalog service.
  await new Promise((r) => setTimeout(r, 50))
  return { title: `Product ${id}` }
}

async function ProductDetails({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await new Promise((r) => setTimeout(r, 50))
  return <p id="details">Detailed specs for product {id}</p>
}

export default function ProductPage(props: {
  params: Promise<{ id: string }>
}) {
  return (
    <main>
      <h1>Product</h1>
      <Suspense fallback={<p>Loading details…</p>}>
        <ProductDetails params={props.params} />
      </Suspense>
    </main>
  )
}
