import { notFound } from 'next/navigation'

export function generateStaticParams() {
  return [{ slug: 'exists' }, { slug: 'missing' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (slug === 'missing') {
    notFound()
  }
  return <p id="post">Post: {slug}</p>
}
