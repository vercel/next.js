import Link from 'next/link'
import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <main>
      <h1>Home</h1>

      <h2>Dynamic posts</h2>
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
    </main>
  )
}
