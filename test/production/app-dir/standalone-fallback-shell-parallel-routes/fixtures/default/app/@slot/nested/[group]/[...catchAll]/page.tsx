export default async function NestedSlotPage({
  params,
}: {
  params: Promise<{ group: string; catchAll: string[] }>
}) {
  return (
    <>
      <p id="nested-slot-page">/@slot/nested/[group]/[...catchAll]</p>
      <p id="nested-slot-params">{JSON.stringify(await params)}</p>
    </>
  )
}
