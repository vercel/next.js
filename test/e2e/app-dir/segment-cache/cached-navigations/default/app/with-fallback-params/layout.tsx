'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ReactNode } from 'react'
import { LinkAccordion } from '../../components/link-accordion'

export default function ParamsLayout({ children }: { children: ReactNode }) {
  const { bfcacheId } = useRouter()

  return (
    <>
      <ul>
        <li>
          <Link href="/with-fallback-params" prefetch={false}>
            /with-fallback-params
          </Link>
        </li>
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
        <li>
          <LinkAccordion
            key={bfcacheId}
            href="/with-fallback-params/foo"
            prefetch={true}
          >
            /with-fallback-params/foo (prefetch=true)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion
            key={bfcacheId}
            href="/with-fallback-params/bar"
            prefetch={true}
          >
            /with-fallback-params/bar (prefetch=true)
          </LinkAccordion>
        </li>
      </ul>
      {children}
    </>
  )
}
