export default async function SlotPage({
  params,
}: {
  params: Promise<{ catchAll: string[] }>
}) {
  return (
    <>
      <p id="slot-page">/@slot/[...catchAll]</p>
      <p id="slot-params">{JSON.stringify(await params)}</p>
    </>
  )
}
