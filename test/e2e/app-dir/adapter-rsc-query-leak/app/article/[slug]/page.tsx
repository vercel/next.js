import { Suspense } from 'react'
import { draftMode } from 'next/headers'
import { connection } from 'next/server'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export function generateStaticParams() {
  return [{ slug: 'built' }]
}

async function Content({ params, searchParams }: Props) {
  await connection()
  const { slug } = await params
  const query = await searchParams
  const { isEnabled } = await draftMode()

  return (
    <>
      <p id="article">{`${isEnabled ? 'Draft' : 'Published'} article ${slug}`}</p>
      <p id="query">{JSON.stringify(query)}</p>
    </>
  )
}

export default function Page(props: Props) {
  return (
    <Suspense fallback={<p>Loading article</p>}>
      <Content {...props} />
    </Suspense>
  )
}
