import { ServerComponentOwner } from './rsc-owner'
import { ClientComponentOwner } from './ssr-owner'

export default function Page() {
  return (
    <>
      <ServerComponentOwner />
      <ClientComponentOwner />
    </>
  )
}
