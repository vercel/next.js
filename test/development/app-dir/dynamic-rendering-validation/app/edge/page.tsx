import { ServerComponentOwner } from '../rsc-owner'
import { ClientComponentOwner } from '../ssr-owner'

export const runtime = 'edge'

export default function Page() {
  return (
    <>
      <ServerComponentOwner />
      <ClientComponentOwner />
    </>
  )
}
