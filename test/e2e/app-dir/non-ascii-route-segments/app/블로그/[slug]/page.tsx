export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return <p id="result">{(await params).slug}</p>
}
