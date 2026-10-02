import { getInventory } from '@/lib/data'

export default async function ProductPage() {
  const inventory = await getInventory()

  return (
    <main>
      <h1>Premium Widget</h1>
      <p>{inventory.count} in stock</p>
      <p>Price: ${inventory.price}</p>
    </main>
  )
}
