import { getImageProps } from 'next/image'
import Link from 'next/link'
import { Newsletter } from '@/components/newsletter'
import { ProductCard } from '@/components/product-card'
import { Sprite } from '@/components/sprite'
import { categories, products } from '@/lib/catalog'

export default function Home() {
  const featured = products.filter((p) => p.featured)
  const { props: hero } = getImageProps({
    src: '/photos/hero.jpg',
    alt: 'Hikers on a ridge at sunrise',
    width: 2400,
    height: 1100,
    sizes: '(min-width: 1240px) 1176px, calc(100vw - 64px)',
    loading: 'eager',
    fetchPriority: 'high',
    className: 'hero-photo',
  })
  return (
    <main>
      <section className="hero">
        <img {...hero} />
        <h1>Gear for the long way round</h1>
      </section>
      <h2>Shop by category</h2>
      <ul className="tiles">
        {categories.map((category) => (
          <li key={category}>
            <Link href={`/products?category=${encodeURIComponent(category)}`}>
              {category}
            </Link>
          </li>
        ))}
      </ul>
      <h2>Featured</h2>
      <ul className="grid" aria-label="Featured products">
        {featured.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </ul>
      <h2>Trail notes in your inbox</h2>
      <Newsletter />
      <Sprite icons={['heart', 'heart-filled']} star />
    </main>
  )
}
