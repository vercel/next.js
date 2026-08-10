import { notFound } from 'next/navigation'

export function generateStaticParams() {
  return [
    { slug: 'a' },
    { slug: 'b' },
    { slug: 'c' },
    { slug: 'd' },
    { slug: 'e' },
    { slug: 'f' },
  ]
}

export default async function GeneratedPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  if (slug !== 'a') {
    notFound()
  }

  return <p>{slug}</p>
}
