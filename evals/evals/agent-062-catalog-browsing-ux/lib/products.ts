export const products = [
  { slug: 'trail-pack', name: 'Trail Pack', category: 'bags', price: 85 },
  { slug: 'ridge-pack', name: 'Ridge Pack', category: 'bags', price: 110 },
  { slug: 'camp-mug', name: 'Camp Mug', category: 'gear', price: 18 },
  { slug: 'summit-bottle', name: 'Summit Bottle', category: 'gear', price: 32 },
  { slug: 'wool-cap', name: 'Wool Cap', category: 'clothing', price: 28 },
]

export type Product = (typeof products)[number]
