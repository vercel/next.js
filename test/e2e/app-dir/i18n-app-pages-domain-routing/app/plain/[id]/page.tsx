export function generateStaticParams() {
  return [{ id: '123' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return <p id="plain-id">{id}</p>
}
