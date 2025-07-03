export default async function PhotoPage(
  props: PageProps<'/gallery/photo/[id]'>
) {
  const params = await props.params

  return (
    <div>
      <h2>Photo {params.id}</h2>
      <p>Viewing photo with ID: {params.id}</p>
    </div>
  )
}
