import { getDocsTree, read } from '@bench/data'
import { Breadcrumbs } from '../../../../../../../components/site'
import { counts } from '../../../../../../../lib/content.mjs'

// Docs, level 4: the section a topic belongs to.
export default async function DocsSectionLayout({ children, params }) {
  const { locale, product, version, section } = await read(params)
  const tree = await getDocsTree(locale, product, version, counts().docs)
  const current = tree.sections.find((s) => s.slug === section)
  return (
    <section className="docs-section">
      <Breadcrumbs
        items={[
          { href: `/${locale}/docs`, label: 'Docs' },
          { href: `/${locale}/docs/${product}/${version}`, label: tree.title },
          { label: current ? current.title : section },
        ]}
      />
      {children}
    </section>
  )
}
