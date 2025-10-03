import Link from 'next/link'
import { ReactNode } from 'react'

export default function Page() {
  return (
    <>
      <Link href="/about">
        <RSC>bar</RSC>
      </Link>

      {/* <LazyComponent /> */}
    </>
  )
}

// function ServerLink(props: any) {
//   console.log('~~ ServerLink ~~')
//   console.log(props.children)
//   console.log('~~ ServerLink ~~')
//   return <Link {...props} />
// }

// function Foo() {
//   // const lazy
// }

// const LazyComponent = React.lazy(() => Promise.resolve({ default: Foo }))

// const lazyChildren = React.lazy(() => Promise.resolve({ default: <Foo /> }))

function RSC({ children }: { children: ReactNode }) {
  // await new Promise((resolve) => setTimeout(resolve, 1))

  return <span>{children}</span>
}
