import { unauthorized } from 'next/navigation'

export function generateStaticParams() {
  return [{ slug: 'authorized' }, { slug: 'unauthorized' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  if (slug === 'authorized') {
    return <p>hello world</p>
  }

  unauthorized()
}
