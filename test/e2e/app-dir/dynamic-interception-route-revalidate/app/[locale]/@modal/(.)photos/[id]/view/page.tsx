import Modal from '../../../../modal'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <div>
      <h1 id="intercepted-page">Intercepted Page</h1>
      <Modal photoId={(await params).id} />
    </div>
  )
}
