import Image from 'next/image'
import { getArticle, getSite, list, read } from '@bench/data'
import { TableOfContents } from '../../../../../components/client/content'
import { Prose } from '../../../../../components/prose'
import { Breadcrumbs } from '../../../../../components/site'
import { counts } from '../../../../../lib/content.mjs'

export async function generateStaticParams() {
  const slugs = await list(`/index/articles?n=${counts().articles}`)
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }) {
  const { locale, slug } = await read(params)
  const article = await getArticle(locale, slug)
  return {
    title: article.title,
    description: article.excerpt,
    authors: [{ name: article.author }],
    keywords: article.tags,
    alternates: { canonical: `/${locale}/articles/${slug}` },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.excerpt,
      publishedTime: article.published,
      url: `/${locale}/articles/${slug}`,
      images: [
        {
          url: article.cover.src,
          width: article.cover.width,
          height: article.cover.height,
          alt: article.cover.alt,
        },
      ],
    },
    twitter: { card: 'summary_large_image', images: [article.cover.src] },
  }
}

// A long text page: 100 to 500 KB of HTML at the default size.
export default async function ArticlePage({ params }) {
  const { locale, slug } = await read(params)
  const [site, article] = await Promise.all([
    getSite(locale),
    getArticle(locale, slug),
  ])
  return (
    <article className="article">
      <Breadcrumbs
        items={[
          { href: `/${locale}`, label: site.name },
          { label: article.title },
        ]}
      />
      <header>
        <h1>{article.title}</h1>
        <p className="byline">
          {article.author},{' '}
          <time dateTime={article.published}>{article.published}</time>
        </p>
        <ul className="tags">
          {article.tags.map((tag, i) => (
            <li key={i}>{tag}</li>
          ))}
        </ul>
        <Image
          src={article.cover.src}
          alt={article.cover.alt}
          width={article.cover.width}
          height={article.cover.height}
          sizes="100vw"
          priority
        />
        <p className="excerpt">{article.excerpt}</p>
      </header>
      <TableOfContents headings={article.headings} label="On this page" />
      <Prose blocks={article.blocks} />
    </article>
  )
}
