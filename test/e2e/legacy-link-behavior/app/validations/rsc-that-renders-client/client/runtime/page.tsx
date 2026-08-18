import { ClientLink } from '../../client-link'
import ClientA from '../_client'

export const prefetch = 'partial'

export default function Page() {
  return (
    <>
      <ClientLink href="/about">
        <ClientA>About</ClientA>
      </ClientLink>
    </>
  )
}
