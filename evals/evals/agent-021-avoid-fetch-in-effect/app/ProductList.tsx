// Example of good server component pattern
interface Product {
  id: string | number
  name: string
}

export default function ProductList({ products }: { products: Product[] }) {
  return (
    <div>
      <h2>Products</h2>
      {products.map((product: Product) => (
        <div key={product.id}>{product.name}</div>
      ))}
    </div>
  )
}
