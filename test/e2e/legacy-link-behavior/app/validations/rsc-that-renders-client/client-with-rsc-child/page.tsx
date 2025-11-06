import { ClientLink } from '../client-link'
import ClientA from './_client'

export default function Page() {
  return (
    <>
      <ClientLink href="/about">
        <ClientA>
          <RSC />
        </ClientA>
      </ClientLink>
    </>
  )
}

async function RSC() {
  return <span>About</span>
}
