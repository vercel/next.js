import { randomUUID } from 'node:crypto'

export const dynamicParams = false
export const revalidate = 3600

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  console.log('product render', slug)
  return (
    <main>
      <p id="slug">{slug}</p>
      <p id="generation">{randomUUID()}</p>
    </main>
  )
}
