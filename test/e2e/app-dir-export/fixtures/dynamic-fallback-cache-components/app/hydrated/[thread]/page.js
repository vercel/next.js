import { Suspense } from 'react'
import { LinkAccordion } from '../../components/link-accordion'
import HydratedThreadClient from './thread-client'

export default function HydratedThreadPage() {
  return (
    <>
      <Suspense fallback={<h1>Loading hydrated thread...</h1>}>
        <HydratedThreadClient />
      </Suspense>
      <ul>
        <li>
          <LinkAccordion href="/hydrated/second">
            Visit hydrated thread second
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/hydrated/third">
            Visit hydrated thread third
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}
