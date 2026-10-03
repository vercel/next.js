import { Suspense } from 'react'
import { HashControls } from '../../hash-controls'

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <>
      <p id="prefetch">prefetch {id}</p>
      <HashControls />
    </>
  )
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p id="loading">loading</p>}>
      <Content params={params} />
    </Suspense>
  )
}
