export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  return <p id="docs">docs: {slug.join('/')}</p>
}
