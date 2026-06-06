import Link from 'next/link'
import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <main>
      <h1>Home</h1>

      <h2>Dynamic posts (force-runtime)</h2>
      <p>
        These posts read request-time data (cookies). Their App Shell is the
        part of the page that doesn&apos;t depend on the URL params, so it can
        be cached once and reused for any post.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/posts/1">Post 1</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/posts/2">Post 2</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/posts/3">Post 3</LinkAccordion>
        </li>
        <li>
          <Link href="/posts/124" prefetch={false}>
            Unprefetched post
          </Link>
        </li>
        <li>
          <Link href="/posts/125?foo=bar" prefetch={false}>
            Unprefetched post with search params
          </Link>
        </li>
      </ul>

      <h2>Static posts</h2>
      <p>
        These posts are fully prerendered at build time. The same shell concept
        applies: navigating to a post whose URL was never prefetched should
        still render an instant shell while the per-URL content loads.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/static-posts/1">Static post 1</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/static-posts/2">Static post 2</LinkAccordion>
        </li>
        <li>
          <Link href="/static-posts/124" prefetch={false}>
            Unprefetched static post
          </Link>
        </li>
      </ul>

      <h2>Partial posts</h2>
      <ul>
        <li>
          <LinkAccordion href="/partial/1">Partial 1 (default)</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/partial/2">Partial 2 (default)</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/partial/3" prefetch={true}>
            Partial 3 (prefetch=true)
          </LinkAccordion>
        </li>
      </ul>

      <h2>Eager posts</h2>
      <ul>
        <li>
          <LinkAccordion href="/eager/1">Eager 1 (default)</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/eager/2">Eager 2 (default)</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/eager-instant/1">
            Eager-instant 1 (unstable_instant + unstable_eager)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/eager-instant/2">
            Eager-instant 2 (unstable_instant + unstable_eager)
          </LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
