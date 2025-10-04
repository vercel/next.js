import Link from 'next/link'
// import ClientComponent from './client-component'
import { lazy } from 'react'

const ClientComponent = lazy(() => import('./client-component'))

export default function Page() {
  return (
    <>
      <Link href="/about" legacyBehavior passHref>
        <ClientComponent>About</ClientComponent>
      </Link>
    </>
  )
}
