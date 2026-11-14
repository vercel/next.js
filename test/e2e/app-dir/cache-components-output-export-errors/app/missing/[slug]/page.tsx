export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return <p>{(await params).slug}</p>
}
