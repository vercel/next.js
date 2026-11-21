import { Suspense } from 'react'
import { HashControls } from '../../hash-controls'
import { ActionControls } from './action-controls'

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <>
      <p id="action">action {id}</p>
      <ActionControls />
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
