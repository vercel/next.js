import { connection } from 'next/server'
import { Suspense } from 'react'
import { LinkAccordion } from '../../components/link-accordion'

async function HubContent() {
  await connection()
  return <h1>Hub B</h1>
}

export default function Page() {
  return (
    <>
      <Suspense fallback={<p>Loading hub...</p>}>
        <HubContent />
      </Suspense>
      <LinkAccordion href="/uncached-time" prefetch={false}>
        Target
      </LinkAccordion>
      <LinkAccordion href="/uncached-time#full-prefetch" prefetch={true}>
        Full prefetch
      </LinkAccordion>
    </>
  )
}
