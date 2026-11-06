import { randomUUID } from 'node:crypto'
import { Suspense } from 'react'
import { connection } from 'next/server'
import { ActionButton } from '../../../action-button'
import { getValue } from '../../../value'

type Params = { kind: string; slug: string }

export function generateStaticParams(): Params[] {
  return [
    { kind: 'static', slug: 'built' },
    { kind: 'partial', slug: 'built' },
  ]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}) {
  const { kind, slug } = await params
  return { title: kind + ':' + slug }
}

async function DynamicValue() {
  await connection()
  return <p id="dynamic">{randomUUID()}</p>
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { kind, slug } = await params
  return (
    <>
      <p id="value">{await getValue(kind, slug)}</p>
      {kind === 'partial' ? (
        <Suspense fallback="Loading dynamic content...">
          <DynamicValue />
        </Suspense>
      ) : null}
      <ActionButton />
    </>
  )
}
