export default async function Page({
  params,
}: {
  params: Promise<{ segments?: string[] }>
}) {
  return <p id="params">{JSON.stringify(await params)}</p>
}
