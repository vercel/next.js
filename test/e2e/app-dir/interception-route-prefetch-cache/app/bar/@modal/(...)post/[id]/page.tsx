import { Modal } from '../../../../Modal'

export default function BarPagePostInterceptSlot({
  params: { id },
}: {
  params: {
    id: string
  }
}) {
  return <Modal title={`Post ${id}`} context="Intercepted on Bar Page" />
}
