import { ClientComponent } from './client'

const noop = () => {}

export default function Page() {
  return (
    <>
      <ClientComponent unknown={noop} unknownAction={noop} />
    </>
  )
}
