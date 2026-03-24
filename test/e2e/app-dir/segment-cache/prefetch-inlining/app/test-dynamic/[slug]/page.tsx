export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <p>Dynamic page: {slug}</p>
}

export function generateStaticParams() {
  return [{ slug: 'hello' }, { slug: 'world' }]
}
