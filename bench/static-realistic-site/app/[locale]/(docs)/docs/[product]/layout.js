import Link from 'next/link'
import { read } from '@bench/data'
import { DOC_PRODUCTS, DOC_VERSIONS } from '../../../../../lib/content.mjs'

export function generateStaticParams() {
  return DOC_PRODUCTS.map((product) => ({ product }))
}

// Docs, level 2: the product and its versions.
export default async function DocsProductLayout({ children, params }) {
  const { locale, product } = await read(params)
  return (
    <div className="docs-product" data-product={product}>
      <nav className="docs-versions" aria-label="Version">
        <ul>
          {DOC_VERSIONS.map((version) => (
            <li key={version}>
              <Link href={`/${locale}/docs/${product}/${version}`}>
                {product} {version}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </div>
  )
}
