export function generateStaticParams() {
  return [{ id: 'one' }, { id: 'two' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <p>result: {id}</p>
}
