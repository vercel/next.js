import Link from 'next/link'
import { ClientComponent } from './_client'

export default function Page() {
  return (
    <>
      <Link href="/about" legacyBehavior passHref>
        <ClientComponent>
          <RSC />
        </ClientComponent>
      </Link>
    </>
  )
}

function RSC() {
  return <span>About</span>
}
