export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  return <p id="detail-language">{(await params).lang}</p>
}
