export async function getCatalog(sort: string) {
  'use cache'
  await new Promise((r) => setTimeout(r, 100))
  const items = [
    { sku: 'A', price: 30 },
    { sku: 'B', price: 10 },
    { sku: 'C', price: 20 },
  ]
  return items
}
