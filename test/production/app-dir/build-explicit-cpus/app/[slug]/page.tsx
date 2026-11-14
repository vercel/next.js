export const dynamicParams = false

export function generateStaticParams() {
  return Array.from({ length: 50 }, (_, i) => ({ slug: `item-${i}` }))
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <p>{slug}</p>
}
