import Modal from '../../../modal'

export default async function PhotoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return (
    <div className="container mx-auto my-10">
      <div className="w-1/2 mx-auto border border-gray-700">
        <h1 id="full-page">Full Page</h1>
        <Modal photoId={(await params).id} />
      </div>
    </div>
  )
}
