'use client'
import Link from 'next/link'
// import { lazy } from 'react'
// import ClientComponent from './client-component'
// import { lazy } from 'react'

// const ClientComponent = lazy(() => import('./client-element'))

export default function Page() {
  return (
    <>
      <Link href="/about" legacyBehavior passHref>
        {/* {element} */}
        asdf
      </Link>
    </>
  )
}

// @ts-ignore
// export const element = lazy(() => Promise.resolve({ default: <a>Linkk</a> }))
