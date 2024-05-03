export default function Page({ params }) {
  return (
    <>
      <h1 id={`page-id-${params.id}`}>Page ID: {params.id}</h1>
    </>
  )
}
