import { Suspense } from 'react'
import { fetchDoc, fetchDocSlugs } from '../../../lib/cms'

export async function generateStaticParams() {
  return await fetchDocSlugs()
}

async function Doc({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const doc = await fetchDoc(slug)
  return (
    <article>
      <h1>{doc.title}</h1>
      <p>{doc.body}</p>
    </article>
  )
}

export default function DocPage(props: {
  params: Promise<{ slug: string }>
}) {
  return (
    <main>
      <Suspense fallback={<p>Loading doc…</p>}>
        <Doc params={props.params} />
      </Suspense>
    </main>
  )
}
