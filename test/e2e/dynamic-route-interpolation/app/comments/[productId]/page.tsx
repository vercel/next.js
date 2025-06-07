export default async function Page({
  params,
}: {
  params: Promise<{ productId: string }>
}) {
  return <h1>{(await params).productId}</h1>
}
