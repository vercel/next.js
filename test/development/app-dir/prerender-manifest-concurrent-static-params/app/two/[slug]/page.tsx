export function generateStaticParams() {
  return [{ slug: 'a' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <p>two {slug}</p>
}
