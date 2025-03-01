export default async function ModalPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <dialog id="intercepted-slot" open>
      <h2>Modal for Interception Page</h2>
      <p>Using route interception</p>
      <p>Param: {id}</p>
    </dialog>
  )
}
