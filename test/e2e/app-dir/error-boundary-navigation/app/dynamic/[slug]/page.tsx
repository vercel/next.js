import { notFound } from 'next/navigation'

export default async function DynamicPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (slug === '404') {
    notFound()
  }

  return <p id="dynamic">Dynamic page: {slug}</p>
}
