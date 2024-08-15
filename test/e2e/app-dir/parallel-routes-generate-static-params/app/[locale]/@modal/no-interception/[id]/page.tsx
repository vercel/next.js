export default function ModalPage({
  params: { id },
}: {
  params: { id: string }
}) {
  return (
    <dialog id="non-intercepted-slot" open>
      <h1>Modal for No Interception Page</h1>
      <p>Param: {id}</p>
    </dialog>
  )
}
