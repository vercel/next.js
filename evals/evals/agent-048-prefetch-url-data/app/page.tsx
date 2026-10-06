import Link from 'next/link'

const categories = [
  { slug: 'featured', label: 'Featured products' },
  { slug: 'sale', label: 'Products on sale' },
]

export default function Home() {
  return (
    <main>
      <h1>Shop by category</h1>
      <ul>
        {categories.map((category) => (
          <li key={category.slug}>
            <Link href={`/catalog?category=${category.slug}`}>
              {category.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
