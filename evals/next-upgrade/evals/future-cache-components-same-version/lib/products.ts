export const products = [
  {
    slug: 'field-notes',
    name: 'Field Notes',
    description: 'Weatherproof notes for long days outside.',
  },
  {
    slug: 'trail-light',
    name: 'Trail Light',
    description: 'A compact light with a warm reading mode.',
  },
]

export function getProduct(slug: string) {
  return products.find((product) => product.slug === slug)
}
