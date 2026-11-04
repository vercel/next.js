import { MetricsPage } from '../../metrics'

export function generateStaticParams() {
  return [{ slug: 'build' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <MetricsPage id={slug} />
}
