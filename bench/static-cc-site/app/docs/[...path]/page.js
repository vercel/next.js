import Link from 'next/link'
import { cacheLife, cacheTag } from 'next/cache'
import { Breadcrumbs } from '../../../../static-isr-site/components/site'
import { TableOfContents } from '../../../../static-isr-site/components/client/site-ui'
import * as data from '../../../../static-isr-site/lib/data'
import { getDoc } from '../../../lib/cms'

export function generateStaticParams() {
  const params = []
  for (let i = 0; i < data.counts().docs; i++) {
    params.push({ path: data.docPath(i) })
  }
  return params
}

export async function generateMetadata({ params }) {
  const { path } = await params
  const doc = await getDoc(path)
  return {
    title: doc.title,
    description: doc.summary,
    alternates: { canonical: `/docs/${path.join('/')}` },
    openGraph: { title: doc.title, description: doc.summary, type: 'article' },
  }
}

// Cached at component level: the entry holds rendered JSX, including client
// component references, instead of data.
async function DocArticle({ path }) {
  'use cache'
  cacheLife('weeks')
  cacheTag('docs', `doc:${path.join('/')}`)
  const doc = await data.getDoc(path)
  return (
    <article className="doc">
      <Breadcrumbs
        items={[
          { href: '/', label: 'Home' },
          { href: `/docs/${doc.section}/topic-1`, label: doc.section },
          { label: doc.title },
        ]}
      />
      <h1>{doc.title}</h1>
      <p className="lead">{doc.summary}</p>
      <TableOfContents
        items={doc.sections.map(({ id, heading }) => ({ id, heading }))}
      />
      {doc.sections.map((section) => (
        <section key={section.id} id={section.id}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((text, i) => (
            <p key={i}>{text}</p>
          ))}
          {section.code ? (
            <pre>
              <code>{section.code}</code>
            </pre>
          ) : null}
        </section>
      ))}
      <footer className="doc-pager">
        <p>
          Last updated <time dateTime={doc.updated}>{doc.updated}</time>
        </p>
        {doc.previous ? (
          <Link href={`/docs/${doc.previous.join('/')}`} rel="prev">
            Previous
          </Link>
        ) : null}
        <Link href={`/docs/${doc.next.join('/')}`} rel="next">
          Next
        </Link>
      </footer>
    </article>
  )
}

export default async function DocPage({ params }) {
  const { path } = await params
  return <DocArticle path={path} />
}
