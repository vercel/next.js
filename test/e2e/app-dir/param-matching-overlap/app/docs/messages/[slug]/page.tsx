export const unstable_paramMatching = { slug: 'not-found' } as const

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <p id="specific">{slug}</p>
}
