// What every generated route (`generate-routes.mjs`) shares: its params,
// metadata, page and layout.
import Image from 'next/image'
import Link from 'next/link'
import { getSection, getSite, list, read } from '@bench/data'
import { counts } from '../lib/content.mjs'
import { Prose } from './prose'
import { Breadcrumbs } from './site'

// A route has `BENCH_PAGES_PER_ROUTE` pages, dealt out to the locales in
// turn; `generateStaticParams` runs once per locale.
export async function sectionParams(name, index, { params }) {
  const c = counts()
  const slugs = await list(
    `/index/sections/${name}/${index}/${params.locale}?n=${c.perRoute}&l=${c.locales}`
  )
  return slugs.map((slug) => ({ slug }))
}

export async function sectionMetadata(name, { params }) {
  const { locale, slug } = await read(params)
  const page = await getSection(name, locale, slug)
  return {
    title: page.title,
    description: page.summary,
    alternates: { canonical: `/${locale}/s/${name}/${slug}` },
  }
}

export function SectionLayout({ name, children }) {
  return (
    <div className="section" data-section={name}>
      {children}
    </div>
  )
}

export async function SectionPage({ name, params }) {
  const { locale, slug } = await read(params)
  const [site, page] = await Promise.all([
    getSite(locale),
    getSection(name, locale, slug),
  ])
  return (
    <article className="section-page">
      <Breadcrumbs
        items={[
          { href: `/${locale}`, label: site.name },
          { label: name },
          { label: page.title },
        ]}
      />
      <h1>{page.title}</h1>
      <p className="summary">{page.summary}</p>
      <p className="byline">
        <time dateTime={page.updated}>{page.updated}</time>
      </p>
      <ul className="cards">
        {page.cards.map((card) => (
          <li key={card.href}>
            <Link href={card.href}>
              <Image
                src={card.image.src}
                alt={card.image.alt}
                width={400}
                height={225}
              />
              <h2>{card.title}</h2>
            </Link>
            <p>{card.text}</p>
          </li>
        ))}
      </ul>
      <Prose blocks={page.blocks} />
    </article>
  )
}
