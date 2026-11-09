import Link from 'next/link'
import { getSite, read } from '@bench/data'

// The shop's route group: a category strip above every product and listing
// page.
export default async function ShopLayout({ children, params }) {
  const { locale } = await read(params)
  const site = await getSite(locale)
  return (
    <div className="shop">
      <nav className="category-strip" aria-label="Categories">
        <ul>
          {site.categories.map((category) => (
            <li key={category.slug}>
              <Link href={`/${locale}/category/${category.slug}`}>
                {category.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </div>
  )
}
