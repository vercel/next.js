export function generateStaticParams() {
  return [{ id: 'known' }]
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <p>Intercepted photo:{id}</p>
}
