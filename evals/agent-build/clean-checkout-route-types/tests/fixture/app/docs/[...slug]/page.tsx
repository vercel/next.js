import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDoc, listDocs } from '@/lib/docs'

export default async function DocPage({
  params,
  searchParams,
}: PageProps<'/docs/[...slug]'>) {
  const { slug } = await params
  const { highlight } = await searchParams
  const doc = getDoc(slug)

  if (!doc) notFound()

  const highlighted =
    typeof highlight === 'string' && doc.body.includes(highlight)
      ? doc.body.replace(highlight, `<mark>${highlight}</mark>`)
      : doc.body

  return (
    <main>
      <nav aria-label="Docs">
        {listDocs().map((entry) => (
          <Link key={entry.path} href={`/docs/${entry.path}`}>
            {entry.title}
          </Link>
        ))}
      </nav>
      <article>
        <h1>{doc.title}</h1>
        <p dangerouslySetInnerHTML={{ __html: highlighted }} />
      </article>
    </main>
  )
}
