import { Modal } from '../../../../Modal'

export default async function BarPagePostInterceptSlot({
  params,
}: {
  params: Promise<{
    id: string
  }>
}) {
  const { id } = await params
  return <Modal title={`Post ${id}`} context="Intercepted on Bar Page" />
}
