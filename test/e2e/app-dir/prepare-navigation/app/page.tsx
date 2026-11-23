import { Suspense } from 'react'
import { connection } from 'next/server'
import { LinkAccordion } from '../components/link-accordion'
import { PrepareLink } from '../components/prepare-link'

async function Content() {
  await connection()
  return <div id="hub-a">Hub A</div>
}

export default function Page() {
  return (
    <>
      <Suspense fallback="Loading hub A...">
        <Content />
      </Suspense>
      <ul>
        <li>
          <LinkAccordion href="/target">Prefetch target</LinkAccordion>
        </li>
        <li>
          <PrepareLink href="/target">Prepare link to target</PrepareLink>
        </li>
        <li>
          <PrepareLink href="/streaming-target">
            Prepare link to streaming target
          </PrepareLink>
        </li>
        <li>
          <PrepareLink href="/streaming-stale">
            Prepare link to streaming page with a dynamic stale time
          </PrepareLink>
        </li>
        <li>
          <LinkAccordion href="/streaming-target">
            Prefetch streaming target
          </LinkAccordion>
        </li>
        <li>
          <PrepareLink href="/streaming-error">
            Prepare link to streaming error
          </PrepareLink>
        </li>
        <li>
          <LinkAccordion href="/static-target">
            Prefetch static target
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/static-param/a" prefetch={true}>
            Prefetch static param a
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}
