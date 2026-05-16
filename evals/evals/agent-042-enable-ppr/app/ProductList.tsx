async function getProducts() {
  const res = await fetch('https://api.example.com/products')
  return res.json()
}

export async function ProductList() {
  const products = await getProducts()

  return (
    <ul>
      {products.map((p: { id: string; name: string; price: number }) => (
        <li key={p.id}>
          {p.name} - ${p.price}
        </li>
      ))}
    </ul>
  )
}
