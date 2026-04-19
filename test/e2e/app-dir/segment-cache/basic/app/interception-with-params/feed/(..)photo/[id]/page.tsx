export default async function InterceptedPhotoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div id="intercepted-photo-page">
      Intercepted photo page for id {JSON.stringify(id)}
    </div>
  )
}

export function generateStaticParams() {
  return [{ id: '1' }]
}
