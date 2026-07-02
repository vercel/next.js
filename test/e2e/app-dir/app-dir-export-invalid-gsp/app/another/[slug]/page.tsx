export function generateStaticParams(): Array<{ slug: string }> {
  return []
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <p>{slug}</p>
}
