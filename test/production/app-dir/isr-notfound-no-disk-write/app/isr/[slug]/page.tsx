import { notFound } from 'next/navigation'

export const revalidate = 60
export const dynamicParams = true

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  if (slug !== 'known') {
    notFound()
  }

  return <p id="slug">{slug}</p>
}
