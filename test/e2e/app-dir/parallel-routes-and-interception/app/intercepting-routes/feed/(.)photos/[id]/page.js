export default function Page({ params }) {
  return (
    <p id={`photo-intercepted-${params.id}`}>Photo INTERCEPTED {params.id}</p>
  )
}
