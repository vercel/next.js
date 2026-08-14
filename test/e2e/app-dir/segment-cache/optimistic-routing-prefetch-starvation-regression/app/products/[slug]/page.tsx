import { Suspense } from 'react'
import { connection } from 'next/server'

type Params = { slug: string }

// Every param value is known via `generateStaticParams`, so each URL has its
// own prerender with the param-dependent content baked in, plus one dynamic
// hole. The baked content is only delivered by that URL's own prefetch
// response. A sibling's response cannot supply it.
export async function generateStaticParams(): Promise<Array<Params>> {
  return [
    { slug: 'alpha' },
    { slug: 'bravo' },
    { slug: 'charlie' },
    { slug: 'delta' },
    { slug: 'echo' },
  ]
}

export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <Suspense fallback={<p>Loading static content...</p>}>
        <SlugContent params={params} />
      </Suspense>
      <Suspense fallback={<p>Loading dynamic content...</p>}>
        <DynamicContent />
      </Suspense>
    </main>
  )
}

async function SlugContent({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  return <p id="slug-content">{`Content of ${slug}`}</p>
}

async function DynamicContent() {
  await connection()
  return <p id="dynamic-content">Dynamic content</p>
}
