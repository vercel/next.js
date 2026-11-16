import { cacheLife } from 'next/cache'
import { LinkAccordion } from '../components/link-accordion'

async function cachedValue() {
  'use cache'
  cacheLife('minutes')
  return Math.random()
}

async function remoteValue() {
  'use cache: remote'
  return Math.random()
}

export default async function Page() {
  return (
    <main>
      <p id="cached">Cached: {await cachedValue()}</p>
      <p id="remote">Remote: {await remoteValue()}</p>
      <LinkAccordion href="/posts/first">Default prefetch</LinkAccordion>
      <LinkAccordion href="/posts/second" prefetch={true}>
        Full prefetch
      </LinkAccordion>
      <LinkAccordion href="/staged" prefetch="navigation">
        Navigation prefetch
      </LinkAccordion>
      <LinkAccordion href="/browser-only" prefetch={false}>
        No prefetch
      </LinkAccordion>
      <LinkAccordion href="/unread/known" prefetch={true}>
        Generated route without params
      </LinkAccordion>
    </main>
  )
}
