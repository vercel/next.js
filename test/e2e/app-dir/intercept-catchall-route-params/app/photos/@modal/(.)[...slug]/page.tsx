export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  return <pre id="intercepted">{JSON.stringify(slug)}</pre>
}
