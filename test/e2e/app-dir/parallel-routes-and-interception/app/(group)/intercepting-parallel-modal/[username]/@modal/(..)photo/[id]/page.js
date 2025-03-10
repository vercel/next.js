export default async function Page({ params }) {
  const { id } = await params
  return <p id={`photo-modal-${id}`}>Photo MODAL {id}</p>
}
