import { fetchAndReport } from '../../../fetch-and-report'

export const revalidate = 1

export function generateStaticParams() {
  return [{ slug: 'built' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  await fetchAndReport(`isr-${slug}`, true)
  return <p>{Date.now()}</p>
}
