import Modal from '../../../../modal'

export default function Page({ params }: { params: { id: string } }) {
  return (
    <div>
      <h1 id="intercepted-page">Intercepted Page</h1>
      <Modal photoId={params.id} />
    </div>
  )
}
