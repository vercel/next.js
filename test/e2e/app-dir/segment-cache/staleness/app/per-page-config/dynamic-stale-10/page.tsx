import { Suspense } from 'react'
import { connection } from 'next/server'
import { LinkAccordion } from '../../../components/link-accordion'

// TODO: Make sure tests are unskipped before marking this as stable
export const unstable_dynamicStaleTime = 10

async function Content() {
  await connection()
  return (
    <div id="dynamic-stale-10-content">Dynamic content (stale time 10s)</div>
  )
}

export default function Page() {
  return (
    <>
      <Suspense fallback="Loading...">
        <Content />
      </Suspense>
      <ul>
        <li>
          <LinkAccordion href="/per-page-config/hub-a">Hub A</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/per-page-config/hub-b">Hub B</LinkAccordion>
        </li>
      </ul>
    </>
  )
}
