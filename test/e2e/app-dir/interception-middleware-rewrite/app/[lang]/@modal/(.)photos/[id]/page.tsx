export default function PhotoModal({
  params: { id: photoId },
}: {
  params: { id: string }
}) {
  return <div>Intercepted Photo ID: {photoId}</div>
}
