import { renderedAtTimestampForSlug } from '../rendered-at'

export function generateStaticParams() {
  return [{ slug: 'prerendered-at-build' }]
}

export default async function SlugPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <p>{await renderedAtTimestampForSlug(slug)}</p>
}
