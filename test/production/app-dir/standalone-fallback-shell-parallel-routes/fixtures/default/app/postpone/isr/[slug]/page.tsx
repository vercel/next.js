export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <>
      <p id="page">/postpone/isr/[slug]</p>
      <p id="params">{JSON.stringify(await params)}</p>
    </>
  )
}
