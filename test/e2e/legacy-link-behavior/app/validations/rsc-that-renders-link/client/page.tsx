import Link from 'next/link'
import { ClientComponent } from './_client'

export default function Page() {
  return (
    <>
      <Link href="/about" legacyBehavior passHref>
        <ClientComponent>About</ClientComponent>
      </Link>
    </>
  )
}
