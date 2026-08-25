export async function ProductDetails({ id }: { id: string }) {
  const res = await fetch(`https://api.example.com/products/${id}`)
  const product = await res.json()
  return <h2>{product.name}</h2>
}
