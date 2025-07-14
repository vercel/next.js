export default async function InterceptedPhotoPage(
  props: PageProps<'/gallery/photo/[id]'>
) {
  const params = await props.params

  return (
    <div>
      <h2>Intercepted Photo {params.id}</h2>
      <p>This is an intercepted view of photo: {params.id}</p>
    </div>
  )
}
