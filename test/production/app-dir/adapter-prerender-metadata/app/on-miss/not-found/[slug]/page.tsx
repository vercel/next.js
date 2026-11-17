import { notFound } from 'next/navigation'

export function generateStaticParams() {
  return [{ slug: 'not-found' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (slug === 'not-found') {
    notFound()
  }
  return <p>On-demand result: {slug}</p>
}
