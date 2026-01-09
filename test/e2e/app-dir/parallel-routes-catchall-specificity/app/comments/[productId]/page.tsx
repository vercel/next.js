export function generateStaticParams() {
  return [{ productId: 'some-text' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ productId: string }>
}) {
  return <h1>{(await params).productId}</h1>
}
