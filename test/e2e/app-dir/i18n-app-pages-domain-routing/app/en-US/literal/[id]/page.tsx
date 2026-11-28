export function generateStaticParams() {
  return [{ id: 'value' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return <p id="literal-locale-id">{id}</p>
}
