import { HashControls } from '../../hash-controls'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <>
      <p id="initial">initial {id}</p>
      <HashControls />
    </>
  )
}
