import Link from 'next/link'
import { ReactNode } from 'react'

export default function Page() {
  return (
    <>
      <Link href="/about" legacyBehavior>
        <RSC>About</RSC>
      </Link>
    </>
  )
}

function RSC({ children }: { children: ReactNode }) {
  return <a>{children}</a>
}
