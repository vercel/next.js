export const dynamicParams = false
export const revalidate = 3600

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  console.log('closed page render', slug)
  return <p id="slug">{slug}</p>
}
