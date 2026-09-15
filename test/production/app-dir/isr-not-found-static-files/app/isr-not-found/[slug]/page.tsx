import { notFound } from 'next/navigation'

export const revalidate = 60
export const dynamicParams = true

export function generateStaticParams() {
  return [{ slug: 'valid' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  if (slug !== 'valid') {
    notFound()
  }

  return <p>Valid ISR slug: {slug}</p>
}
