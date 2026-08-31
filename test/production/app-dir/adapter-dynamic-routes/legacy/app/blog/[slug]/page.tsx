export function generateStaticParams() {
  return [{ slug: 'one' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return <p>{slug}</p>
}
