import Link from 'next/link'
import { getDocsTree, read } from '@bench/data'
import { DOC_PRODUCTS, DOC_VERSIONS, counts } from '../../../../lib/content.mjs'

export const metadata = { title: 'Documentation' }

export default async function DocsIndexPage({ params }) {
  const { locale } = await read(params)
  const size = counts().docs
  const trees = await Promise.all(
    DOC_PRODUCTS.map((product) =>
      getDocsTree(locale, product, DOC_VERSIONS[0], size)
    )
  )
  return (
    <>
      <h1>Documentation</h1>
      {trees.map((tree) => (
        <section key={tree.product}>
          <h2>{tree.title}</h2>
          <ul>
            {tree.sections.map((section) => (
              <li key={section.slug}>
                <Link href={section.topics[0].href}>{section.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}
