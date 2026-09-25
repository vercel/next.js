import { randomUUID } from 'node:crypto'
import { draftMode } from 'next/headers'
import { ActionButton } from './button'

export const dynamicParams = false
export const revalidate = 3600

export function generateStaticParams() {
  return [{ slug: 'known' }, { slug: 'forwarded' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { isEnabled } = await draftMode()
  return (
    <main id="product">
      <p id="slug">{slug}</p>
      <p id="draft">{isEnabled ? 'draft' : 'published'}</p>
      <p id="generation">{randomUUID()}</p>
      <ActionButton />
    </main>
  )
}
