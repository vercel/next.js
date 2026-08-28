import { Suspense } from 'react'
import { saveProduct } from '@/app/admin/actions'
import { getProduct } from '@/lib/queries'

async function EditForm({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) {
    return <p>Product not found.</p>
  }
  return (
    <>
      <p>Current name: {product.name}</p>
      <p>Current price: {product.price}</p>
      <form action={saveProduct}>
        <input type="hidden" name="slug" value={product.slug} />
        <label>
          Name
          <input type="text" name="name" defaultValue={product.name} />
        </label>
        <label>
          Price
          <input
            type="text"
            name="price"
            defaultValue={String(product.price)}
          />
        </label>
        <button type="submit">Save</button>
      </form>
    </>
  )
}

export default function AdminProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <main>
      <h1>Edit product</h1>
      <Suspense fallback={<p>Loading editor…</p>}>
        <EditForm params={params} />
      </Suspense>
    </main>
  )
}
