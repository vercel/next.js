import Link from 'next/link'
import { getSite, read } from '@bench/data'
import { DOC_PRODUCTS, DOC_VERSIONS } from '../../../../lib/content.mjs'

// Docs, level 1 of 4 below the root layout: the docs chrome.
export default async function DocsLayout({ children, params }) {
  const { locale } = await read(params)
  const site = await getSite(locale)
  return (
    <div className="docs">
      <nav className="docs-products" aria-label="Documentation">
        <Link href={`/${locale}/docs`}>{site.name} documentation</Link>
        <ul>
          {DOC_PRODUCTS.map((product) => (
            <li key={product}>
              <Link href={`/${locale}/docs/${product}/${DOC_VERSIONS[0]}`}>
                {product}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </div>
  )
}
