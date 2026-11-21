import Link from 'next/link'
import { getCatalog, getSite, read } from '@bench/data'
import { ProductCard } from '../../components/site'
import { CATEGORIES } from '../../lib/content.mjs'

export async function generateMetadata({ params }) {
  const { locale } = await read(params)
  const site = await getSite(locale)
  return {
    title: { absolute: `${site.name}: ${site.tagline}` },
    alternates: { canonical: `/${locale}` },
  }
}

export default async function HomePage({ params }) {
  const { locale } = await read(params)
  // Both at once. A second request made in the continuation of the first
  // would resolve without I/O whenever another page of the same worker has
  // put the response into the data cache, and its rows would then join the
  // layout's in one flush: the output would depend on which worker rendered
  // which page.
  const [site, featured] = await Promise.all([
    getSite(locale),
    getCatalog(locale, CATEGORIES[0]),
  ])
  return (
    <>
      <section className="hero">
        <h1>{site.name}</h1>
        <p>{site.tagline}</p>
      </section>
      <section>
        <h2>Shop by category</h2>
        <ul className="categories">
          {site.categories.map((category) => (
            <li key={category.slug}>
              <Link href={`/${locale}/category/${category.slug}`}>
                {category.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>{featured.title}</h2>
        <div className="grid">
          {featured.products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              currency={site.currency}
            />
          ))}
        </div>
      </section>
    </>
  )
}
