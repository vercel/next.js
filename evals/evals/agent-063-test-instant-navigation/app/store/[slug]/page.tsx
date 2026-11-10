import { Suspense } from 'react'
import Link from 'next/link'
import { getProduct, getStock } from '@/lib/data'

type Params = Promise<{ slug: string }>
export default function ProductPage({ params }: { params: Params }) {
  return (
    <main>
      <nav>
        <Link href="/store/shoes" prefetch={true}>
          Shoes
        </Link>
        <Link href="/store/hats" prefetch={true}>
          Hats
        </Link>
      </nav>
      <Suspense fallback={<p>Loading product...</p>}>
        <ProductInfo params={params} />
      </Suspense>
      <Suspense fallback={<p>Checking availability...</p>}>
        <Inventory params={params} />
      </Suspense>
    </main>
  )
}
async function ProductInfo({ params }: { params: Params }) {
  const { slug } = await params
  const product = await getProduct(slug)
  return (
    <>
      <h1>{product.name}</h1>
      <p>Price: ${product.price}</p>
    </>
  )
}
async function Inventory({ params }: { params: Params }) {
  const { slug } = await params
  const count = await getStock(slug)
  return <p>{count} in stock</p>
}
