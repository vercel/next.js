export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  return <pre id="page">{JSON.stringify(slug)}</pre>
}
