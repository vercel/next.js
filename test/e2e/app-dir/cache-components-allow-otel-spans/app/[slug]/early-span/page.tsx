import { TracedComponentEarlyTracerSpan } from '../../traced-work'

export function generateStaticParams() {
  return [{ slug: 'prerendered' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (slug === 'prerendered') {
    return null
  }

  return <TracedComponentEarlyTracerSpan />
}
