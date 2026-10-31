import { connection } from 'next/server'
import { Suspense } from 'react'
import { LinkAccordion } from '../components/link-accordion'

// `connection()` ensures the hub is dynamically rendered.
async function HubContent() {
  await connection()
  return <div id="hub-content">Hub</div>
}

export default function HubPage() {
  return (
    <div id="hub">
      <Suspense fallback={<div data-loading>Loading…</div>}>
        <HubContent />
      </Suspense>
      <ul>
        <li>
          <LinkAccordion href="/foo">unencoded</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/foo%2Fbar">encoded slash</LinkAccordion>
        </li>
      </ul>
    </div>
  )
}
