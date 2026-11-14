import Link from 'next/link'
import { getDoc, getDocsTree, list, read } from '@bench/data'
import { TableOfContents } from '../../../../../../../../components/client/content'
import { Prose } from '../../../../../../../../components/prose'
import { counts } from '../../../../../../../../lib/content.mjs'

// Called once per locale, product and version (the params of the layouts
// above): the sections and topics of that version.
export async function generateStaticParams({ params }) {
  const { locale, product, version } = params
  const tree = await list(
    `/docs-tree/${locale}/${product}/${version}?n=${counts().docs}`
  )
  return tree.sections.flatMap((section) =>
    section.topics.map((topic) => ({
      section: section.slug,
      topic: topic.slug,
    }))
  )
}

export async function generateMetadata({ params }) {
  const { locale, product, version, section, topic } = await read(params)
  const doc = await getDoc(locale, product, version, section, topic)
  return {
    title: `${doc.title} (${product} ${version})`,
    description: doc.summary,
    alternates: {
      canonical: `/${locale}/docs/${product}/${version}/${section}/${topic}`,
    },
  }
}

export default async function DocPage({ params }) {
  const { locale, product, version, section, topic } = await read(params)
  const [tree, doc] = await Promise.all([
    getDocsTree(locale, product, version, counts().docs),
    getDoc(locale, product, version, section, topic),
  ])
  const topics = tree.sections.flatMap((s) => s.topics)
  const at = topics.findIndex((t) => t.href.endsWith(`/${section}/${topic}`))
  const previous = topics[at - 1]
  const next = topics[at + 1]
  return (
    <article className="doc">
      <h1>{doc.title}</h1>
      <p className="summary">{doc.summary}</p>
      <p className="byline">
        Updated <time dateTime={doc.updated}>{doc.updated}</time>
      </p>
      <TableOfContents headings={doc.headings} label="On this page" />
      <Prose blocks={doc.blocks} />
      <nav className="pager" aria-label="Pages">
        {previous ? (
          <Link href={previous.href} rel="prev">
            {previous.title}
          </Link>
        ) : null}
        {next ? (
          <Link href={next.href} rel="next">
            {next.title}
          </Link>
        ) : null}
      </nav>
    </article>
  )
}
