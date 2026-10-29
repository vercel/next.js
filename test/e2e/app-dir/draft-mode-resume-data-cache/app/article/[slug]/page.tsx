import { Suspense } from 'react'
import Link from 'next/link'
import { cookies, draftMode } from 'next/headers'
import { setDraftMode } from '../../actions'
import { readContent } from '../../read-content'

export function generateStaticParams() {
  return [{ slug: 'a' }, { slug: 'b' }]
}

async function RequestContent() {
  // Keep the route partially prerendered while cached content enters the static
  // RDC.
  await cookies()
  const { isEnabled } = await draftMode()
  return <p id="current-mode">{isEnabled ? 'DRAFT' : 'PUBLISHED'}</p>
}

export default async function Page({ params }: PageProps<'/article/[slug]'>) {
  const { slug } = await params
  const content = await readContent(`article:${slug}`)
  return (
    <>
      <h1>Article {slug}</h1>
      <p id="page-content">{content}</p>
      <Link href={slug === 'a' ? '/article/b' : '/article/a'} prefetch={false}>
        Other article
      </Link>
      <form action={setDraftMode.bind(null, true)}>
        <button id="enable-draft">Enable draft mode</button>
      </form>
      <form action={setDraftMode.bind(null, false)}>
        <button id="disable-draft">Disable draft mode</button>
      </form>
      <Suspense fallback={<p>Loading request content</p>}>
        <RequestContent />
      </Suspense>
    </>
  )
}
