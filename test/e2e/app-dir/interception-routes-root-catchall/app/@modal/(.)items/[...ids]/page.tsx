export default async function Page({
  params,
}: {
  params: Promise<{ ids: string[] }>
}) {
  const { ids } = await params
  return <div>Intercepted Modal Page. Id: {ids}</div>
}
