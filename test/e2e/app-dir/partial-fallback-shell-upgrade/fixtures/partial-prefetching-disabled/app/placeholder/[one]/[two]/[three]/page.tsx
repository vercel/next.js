export default async function Page({
  params,
}: {
  params: Promise<{ one: string; two: string; three: string }>
}) {
  const { three } = await params

  return <div id="three">{three}</div>
}
