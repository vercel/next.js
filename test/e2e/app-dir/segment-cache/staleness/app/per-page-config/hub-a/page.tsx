import { Suspense } from 'react'
import { connection } from 'next/server'
import { LinkAccordion } from '../../../components/link-accordion'

async function Content() {
  await connection()
  return <div id="hub-a-content">Hub a</div>
}

export default function Page() {
  return (
    <>
      <Suspense fallback="Loading...">
        <Content />
      </Suspense>
      <ul>
        <li>
          <LinkAccordion href="/per-page-config/dynamic-stale-10">
            Dynamic page with stale time of 10 seconds
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/per-page-config/dynamic-stale-60">
            Dynamic page with stale time of 60 seconds
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}
