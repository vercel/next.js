import { Suspense } from 'react'
import Link from 'next/link'
import {
  Breadcrumbs,
  ProductCard,
} from '../../../../../static-isr-site/components/site'
import { Filters } from '../../../../../static-isr-site/components/client/product-ui'
import { CATEGORIES, counts } from '../../../../../static-isr-site/lib/data'
import { SortControls } from '../../../../components/dynamic'
import { SortSkeleton } from '../../../../components/skeletons'
import { getCategoryFacets, getListing } from '../../../../lib/cms'
import { holesEnabled } from '../../../../lib/session'

export function generateStaticParams() {
  const params = []
  const { listings } = counts()
  for (let i = 0; i < listings; i++) {
    params.push({
      category: CATEGORIES[i % CATEGORIES.length],
      page: String(Math.floor(i / CATEGORIES.length) + 1),
    })
  }
  return params
}

export async function generateMetadata({ params }) {
  const { category, page } = await params
  const listing = await getListing(category, page)
  return {
    title: listing.title,
    description: listing.intro,
    alternates: { canonical: `/category/${category}/${page}` },
    openGraph: { title: listing.title, description: listing.intro },
  }
}

export default async function ListingPage({ params, searchParams }) {
  const { category, page } = await params
  const listing = await getListing(category, page)
  const facets = await getCategoryFacets(category)
  const pages = [1, 2, 3, 4, 5].map((offset) => listing.page - 3 + offset)
  return (
    <>
      <Breadcrumbs
        items={[{ href: '/', label: 'Home' }, { label: listing.category }]}
      />
      <h1>{listing.title}</h1>
      <p className="lead">{listing.intro}</p>
      {holesEnabled() ? (
        <Suspense fallback={<SortSkeleton />}>
          <SortControls
            category={category}
            page={page}
            searchParams={searchParams}
          />
        </Suspense>
      ) : null}
      <div className="listing">
        <Filters category={category} facets={facets} />
        <div className="grid">
          {listing.products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
      <nav className="pagination" aria-label="Pages">
        <ol>
          {pages
            .filter((n) => n >= 1)
            .map((n) => (
              <li key={n}>
                <Link
                  href={`/category/${category}/${n}`}
                  aria-current={n === listing.page ? 'page' : undefined}
                >
                  {n}
                </Link>
              </li>
            ))}
        </ol>
      </nav>
    </>
  )
}
