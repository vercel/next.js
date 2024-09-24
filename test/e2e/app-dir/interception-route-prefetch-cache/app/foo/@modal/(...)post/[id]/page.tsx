import { Modal } from '../../../../Modal'

export default function FooPagePostInterceptSlot({
  params: { id },
}: {
  params: {
    id: string
  }
}) {
  return <Modal title={`Post ${id}`} context="Intercepted on Foo Page" />
}
