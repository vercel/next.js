import { Suspense } from 'react'
import { getCatalog, getSite, read } from '@bench/data'
import { ProductTable } from '../../../../../components/client/product'
import { HOLES, HoleSkeleton, SortNote } from '../../../../../components/holes'
import { Breadcrumbs, ProductCard } from '../../../../../components/site'
import { CATEGORIES, counts } from '../../../../../lib/content.mjs'

export function generateStaticParams() {
  return CATEGORIES.slice(0, counts().categories).map((category) => ({
    category,
  }))
}

export async function generateMetadata({ params }) {
  const { locale, category } = await read(params)
  const catalog = await getCatalog(locale, category)
  return {
    title: catalog.title,
    description: catalog.intro,
    alternates: { canonical: `/${locale}/category/${category}` },
  }
}

export default async function CategoryPage({ params, searchParams }) {
  const { locale, category } = await read(params)
  const [site, catalog] = await Promise.all([
    getSite(locale),
    getCatalog(locale, category),
  ])
  return (
    <>
      <Breadcrumbs
        items={[
          { href: `/${locale}`, label: site.name },
          { label: catalog.title },
        ]}
      />
      <h1>{catalog.title}</h1>
      <p>{catalog.intro}</p>
      {HOLES ? (
        <Suspense fallback={<HoleSkeleton label="Sorting" />}>
          <SortNote searchParams={searchParams} />
        </Suspense>
      ) : null}
      <aside className="facets">
        {catalog.facets.map((facet) => (
          <section key={facet.name}>
            <h2>{facet.name}</h2>
            <ul>
              {facet.values.map((value, i) => (
                <li key={i}>
                  {value.label} ({value.count})
                </li>
              ))}
            </ul>
          </section>
        ))}
      </aside>
      <div className="grid">
        {catalog.products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            currency={site.currency}
          />
        ))}
      </div>
      <ProductTable products={catalog.products} currency={site.currency} />
    </>
  )
}
