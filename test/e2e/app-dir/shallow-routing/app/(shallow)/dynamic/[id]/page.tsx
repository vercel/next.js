export default async function Page(props) {
  const params = await props.params
  return (
    <>
      <h1 id={`page-id-${params.id}`}>Page ID: {params.id}</h1>
    </>
  )
}
