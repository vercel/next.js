import Link from 'next/link'
import { ArticleTeaser, ProductCard } from '../components/site'
import {
  CATEGORIES,
  articleSlug,
  getArticleTeaser,
  getProductSummary,
} from '../lib/data'

export const revalidate = 300

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <h1>Durable goods for work and the outdoors</h1>
        <p className="lead">
          Field-tested gear, honest prices, and a repair program for everything
          we sell.
        </p>
      </section>
      <section>
        <h2>Shop by category</h2>
        <ul className="menus">
          {CATEGORIES.map((category) => (
            <li key={category}>
              <Link href={`/category/${category}/1`}>{category}</Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Featured</h2>
        <div className="grid">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((id) => (
            <ProductCard key={id} product={getProductSummary(id)} />
          ))}
        </div>
      </section>
      <section>
        <h2>Field notes</h2>
        <div className="grid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <ArticleTeaser key={i} article={getArticleTeaser(articleSlug(i))} />
          ))}
        </div>
      </section>
    </>
  )
}
