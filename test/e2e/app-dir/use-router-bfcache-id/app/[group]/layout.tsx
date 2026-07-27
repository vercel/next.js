'use client'

import { useRouter } from 'next/navigation'
import { ReactNode, Suspense } from 'react'
import { LinkAccordion } from '../../components/link-accordion'

export default function GroupLayout({ children }: { children: ReactNode }) {
  const { bfcacheId } = useRouter()
  return (
    <div>
      <nav>
        <LinkAccordion href="/x/1">/x/1</LinkAccordion>
        <LinkAccordion href="/x/2">/x/2</LinkAccordion>
        <LinkAccordion href="/y/1">/y/1</LinkAccordion>
      </nav>
      <form key={bfcacheId}>
        <input data-testid="layout-input" defaultValue="" />
      </form>
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  )
}
