'use client'

import Link from 'next/link'
// import { ClientA } from './_client'

export default function Page() {
  return (
    <>
      <Link href="/about" legacyBehavior>
        client page
        {/* <RSC>foo</RSC> */}
        {/* <ClientA>food</ClientA> */}
        {/* {lazyChildren} */}
        {/* <LazyA>bar</LazyA> */}
      </Link>

      {/* <LazyComponent /> */}
    </>
  )
}

// function Foo() {
//   // const lazy
// }

// const LazyComponent = React.lazy(() => Promise.resolve({ default: Foo }))

// const lazyChildren = React.lazy(() => Promise.resolve({ default: <Foo /> }))

// function A({ children }: { children: ReactNode }) {
//   // await new Promise((resolve) => setTimeout(resolve, 1))

//   return <a>{children}</a>
// }

// const LazyA = React.lazy(() => Promise.resolve({ default: A }))
