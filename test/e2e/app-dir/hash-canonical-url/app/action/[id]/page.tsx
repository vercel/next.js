import { HashControls } from '../../hash-controls'
import { ActionControls } from './action-controls'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <>
      <p id="action">action {id}</p>
      <ActionControls />
      <HashControls />
    </>
  )
}
