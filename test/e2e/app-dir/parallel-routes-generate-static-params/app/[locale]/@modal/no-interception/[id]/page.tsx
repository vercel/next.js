export default async function ModalPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <dialog id="non-intercepted-slot" open>
      <h1>Modal for No Interception Page</h1>
      <p>Param: {id}</p>
    </dialog>
  )
}
