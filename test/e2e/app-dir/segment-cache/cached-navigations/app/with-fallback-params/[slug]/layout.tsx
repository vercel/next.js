import Link from 'next/link'
import { ReactNode } from 'react'

export default function ParamsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ul>
        <li>
          <Link href="/with-fallback-params/foo" prefetch={false}>
            /with-fallback-params/foo
          </Link>
        </li>
        <li>
          <Link href="/with-fallback-params/bar" prefetch={false}>
            /with-fallback-params/bar
          </Link>
        </li>
      </ul>
      {children}
    </>
  )
}
