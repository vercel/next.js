export async function getDeals() {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve, 50))
  return [
    { sku: 'A1', price: 19.99 },
    { sku: 'B2', price: 5.49 },
  ]
}

export async function getInventory() {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve, 50))
  return { A1: 12, B2: 0 }
}

export async function getRates() {
  'use cache'
  await new Promise((resolve) => setTimeout(resolve, 50))
  return { usd: 1, eur: 0.86 }
}
