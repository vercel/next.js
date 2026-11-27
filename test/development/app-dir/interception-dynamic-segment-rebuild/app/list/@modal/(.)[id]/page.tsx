import { Suspense } from 'react'
import type { Metadata } from 'next'

type Params = Promise<{ id: string }>

export async function generateMetadata({
  params,
}: {
  params: Params
}): Promise<Metadata> {
  const { id } = await params
  return { title: `Modal metadata: ${id}` }
}

async function ModalItem({ params }: { params: Params }) {
  const { id } = await params
  return <p id="modal">Modal item: {id}</p>
}

export default function ModalPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<p>Loading modal...</p>}>
      <ModalItem params={params} />
    </Suspense>
  )
}
