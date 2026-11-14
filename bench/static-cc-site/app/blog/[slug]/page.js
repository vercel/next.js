import Image from 'next/image'
import {
  ArticleTeaser,
  Breadcrumbs,
} from '../../../../static-isr-site/components/site'
import {
  ShareButtons,
  TableOfContents,
} from '../../../../static-isr-site/components/client/site-ui'
import {
  articleSlug,
  counts,
  getArticleTeaser,
} from '../../../../static-isr-site/lib/data'
import { getArticle } from '../../../lib/cms'

export function generateStaticParams() {
  const params = []
  for (let i = 0; i < counts().articles; i++) {
    params.push({ slug: articleSlug(i) })
  }
  return params
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const article = await getArticle(slug)
  return {
    title: article.title,
    description: article.excerpt,
    authors: [{ name: article.author }],
    keywords: article.tags,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.excerpt,
      url: `/blog/${slug}`,
      publishedTime: `${article.date}T00:00:00.000Z`,
      authors: [article.author],
      images: [
        {
          url: article.cover.src,
          width: article.cover.width,
          height: article.cover.height,
          alt: article.cover.alt,
        },
      ],
    },
  }
}

export default async function ArticlePage({ params }) {
  const { slug } = await params
  const article = await getArticle(slug)
  return (
    <article className="article">
      <Breadcrumbs
        items={[
          { href: '/', label: 'Home' },
          { href: '/blog/field-notes-0', label: 'Field notes' },
          { label: article.title },
        ]}
      />
      <header>
        <h1>{article.title}</h1>
        <p className="byline">
          {article.author} · <time dateTime={article.date}>{article.date}</time>{' '}
          · {article.readingMinutes} min read
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
          priority
        />
      </header>
      <TableOfContents
        items={article.sections.map(({ id, heading }) => ({ id, heading }))}
      />
      {article.sections.map((section) => (
        <section key={section.id} id={section.id}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((text, i) => (
            <p key={i}>{text}</p>
          ))}
          {section.points ? (
            <ul>
              {section.points.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
      <ShareButtons url={`/blog/${slug}`} title={article.title} />
      <aside className="related">
        <h2>Keep reading</h2>
        <div className="grid">
          {article.related.map((relatedSlug) => (
            <ArticleTeaser
              key={relatedSlug}
              article={getArticleTeaser(relatedSlug)}
            />
          ))}
        </div>
      </aside>
    </article>
  )
}
