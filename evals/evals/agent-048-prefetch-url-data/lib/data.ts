const productsByCategory: Record<string, string[]> = {
  featured: ['Desk Lamp', 'Wool Blanket'],
  sale: ['Canvas Tote', 'Travel Mug'],
}

export async function getProducts(category: string) {
  await new Promise((resolve) => setTimeout(resolve, 800))
  return productsByCategory[category] ?? []
}
