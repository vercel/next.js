import ProductList from './ProductList'
import UserProfile from './UserProfile'

// Example of existing server component with data fetching
async function getProducts() {
  try {
    const res = await fetch('/api/products')
    return res.json()
  } catch {
    // Return mock data for build time
    return [{ id: 1, name: 'Sample Product' }]
  }
}

export default async function Page() {
  const products = await getProducts()

  return (
    <div>
      <h1>Dashboard</h1>
      <ProductList products={products} />
      <UserProfile />
    </div>
  )
}
