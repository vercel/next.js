export default async function Page({
  params,
}: {
  params: Promise<{ one: string; two: string }>
}) {
  const { two } = await params

  return <div id="two">{two}</div>
}
