const products = {
  lamp: { slug: 'lamp', name: 'Brass lamp', usd: 120 },
  vase: { slug: 'vase', name: 'Stone vase', usd: 80 },
}

export async function getProduct(slug: string, currency: string) {
  await new Promise((resolve) => setTimeout(resolve, 120))
  const product = products[slug as keyof typeof products]
  if (!product) return null
  const rate = currency === 'EUR' ? 0.92 : 1
  return { ...product, price: `${currency} ${(product.usd * rate).toFixed(2)}` }
}

export async function getRelatedProducts(slug: string) {
  await new Promise((resolve) => setTimeout(resolve, 420))
  return Object.values(products).filter((product) => product.slug !== slug)
}
