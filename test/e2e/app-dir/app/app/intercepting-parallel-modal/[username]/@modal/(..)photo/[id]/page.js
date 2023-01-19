export default function Page({ params }) {
  return <p id={`photo-modal-${params.id}`}>Photo MODAL {params.id}</p>
}
