export default function Page({ params }) {
  return <p id={`photo-page-${params.id}`}>Photo PAGE {params.id}</p>
}
