export async function ProductDetails({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const res = await fetch(`https://api.example.com/products/${id}`)
  const product = await res.json()
  return <h2>{product.name}</h2>
}
