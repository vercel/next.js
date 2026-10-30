import { products } from '../../../lib/products'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').toLowerCase()
  const category = searchParams.get('category') || 'all'
  // Simulate a remote catalog. Short searches can finish after later requests.
  await new Promise((resolve) =>
    setTimeout(resolve, q.length === 1 ? 1200 : 300)
  )
  return Response.json(
    products.filter(
      (product) =>
        product.name.toLowerCase().includes(q) &&
        (category === 'all' || product.category === category)
    )
  )
}
