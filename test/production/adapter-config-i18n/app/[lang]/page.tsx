export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  return <p>App page: {(await params).lang}</p>
}
