export default function ModalPage({
  params: { id },
}: {
  params: { id: string }
}) {
  return (
    <dialog id="intercepted-slot" open>
      <h2>Modal for Interception Page</h2>
      <p>Using route interception</p>
      <p>Param: {id}</p>
    </dialog>
  )
}
