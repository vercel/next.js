import { notFound } from 'next/navigation'

export default async function Slot({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  if (slug.join('/') === 'slot-missing') notFound()
  return null
}
