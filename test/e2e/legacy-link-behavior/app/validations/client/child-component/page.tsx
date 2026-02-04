'use client'

import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/about" legacyBehavior passHref>
        <ChildComponent>About</ChildComponent>
      </Link>
    </>
  )
}

function ChildComponent(props: any) {
  return <a {...props} />
}
