export function generateStaticParams() {
  return [{ ids: ['1'] }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ ids: string[] }>
}) {
  const { ids } = await params
  return <div>Regular Item Page. Id: {ids}</div>
}
