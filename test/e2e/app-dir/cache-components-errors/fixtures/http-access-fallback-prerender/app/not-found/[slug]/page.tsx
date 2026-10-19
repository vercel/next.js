import { notFound } from 'next/navigation'

export function generateStaticParams() {
  return [{ slug: 'found' }, { slug: 'not-found' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  if (slug === 'found') {
    return <p>hello world</p>
  }

  notFound()
}
