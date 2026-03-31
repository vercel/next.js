export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { slug } = await params

  return <div id="slug">{slug}</div>
}
