export default async function NestedPage({
  params,
}: {
  params: Promise<{ group: string; item: string }>
}) {
  return (
    <>
      <p id="nested-page">/nested/[group]/items/[item]</p>
      <p id="nested-params">{JSON.stringify(await params)}</p>
    </>
  )
}
