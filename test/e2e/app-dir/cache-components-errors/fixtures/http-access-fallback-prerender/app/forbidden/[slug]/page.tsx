import { forbidden } from 'next/navigation'

export function generateStaticParams() {
  return [{ slug: 'allowed' }, { slug: 'forbidden' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  if (slug === 'allowed') {
    return <p>hello world</p>
  }

  forbidden()
}
