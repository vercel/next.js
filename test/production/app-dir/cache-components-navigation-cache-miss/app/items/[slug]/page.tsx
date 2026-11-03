import { existsSync } from 'node:fs'
import { Suspense } from 'react'
import { connection } from 'next/server'

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return [{ slug: 'static' }, { slug: 'becomes-partial' }]
}

async function Content({ params }: Props) {
  const { slug } = await params
  if (existsSync(slug + '.partial')) {
    await connection()
  }
  return <p id="slug">{slug}</p>
}

export default function Page(props: Props) {
  return (
    <Suspense fallback={<p id="loading">Loading...</p>}>
      <Content {...props} />
    </Suspense>
  )
}
