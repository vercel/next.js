import { ReactNode } from 'react'
import { ClientLink } from '../client-link'

export default function Page() {
  return (
    <>
      <ClientLink href="/about">
        <RSC>About</RSC>
      </ClientLink>
    </>
  )
}

async function RSC({ children }: { children: ReactNode }) {
  return <a>{children}</a>
}
