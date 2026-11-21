export const dynamicParams = false

export function generateStaticParams() {
  return [{ slug: 'about' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <p id="page-content">Page: {slug}</p>
}
