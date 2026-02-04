export default async function PhotoModal({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: photoId } = await params
  return <div>Intercepted Photo ID: {photoId}</div>
}
