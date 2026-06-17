import Link from 'next/link'
import { LinkAccordion } from '../../../components/link-accordion'
import { LinkWithPendingIndicator } from '../../../components/link-with-pending-indicator'

export default function Page() {
  return (
    <main>
      <h1>Home</h1>

      <h2>Dynamic posts (allow-runtime)</h2>
      <p>
        These posts read request-time data (cookies) and root params. Their App
        Shell is the part of the page that doesn&apos;t depend on the URL
        params, so it can be cached once and reused for any post.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/with-root-param/en/posts/1">
            Post 1 (en)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/with-root-param/en/posts/2">
            Post 2 (en)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/with-root-param/en/posts/3">
            Post 3 (en)
          </LinkAccordion>
        </li>
        <li>
          <Link href="/with-root-param/en/posts/124" prefetch={false}>
            Unprefetched post 124 (en)
          </Link>
        </li>
        <li>
          <LinkWithPendingIndicator
            href="/with-root-param/en/posts/125?foo=bar"
            prefetch={false}
          >
            Unprefetched post with search params (en)
          </LinkWithPendingIndicator>
        </li>
        <li>
          <LinkWithPendingIndicator
            href="/with-root-param/pl/posts/126"
            prefetch={false}
          >
            Unprefetched post 126 (pl)
          </LinkWithPendingIndicator>
        </li>
        <li>
          <LinkAccordion href="/with-root-param/fr/posts/1">
            Post 1 (fr)
          </LinkAccordion>
        </li>
        <li>
          <LinkWithPendingIndicator
            href="/with-root-param/fr/posts/124"
            prefetch={false}
          >
            Unprefetched post 124 (fr)
          </LinkWithPendingIndicator>
        </li>
      </ul>

      <h2>Static posts</h2>
      <p>
        These posts are fully prerendered at build time. The same shell concept
        applies: navigating to a post whose URL was never prefetched should
        still render an instant shell while the per-URL content loads (unless
        the root params are different)
      </p>
      <ul>
        <li>
          <LinkAccordion href="/with-root-param/en/static-posts/1">
            Static post 1 (en)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/with-root-param/en/static-posts/2">
            Static post 2 (en)
          </LinkAccordion>
        </li>
        <li>
          <LinkWithPendingIndicator
            href="/with-root-param/en/static-posts/124"
            prefetch={false}
          >
            Unprefetched static post 124 (en)
          </LinkWithPendingIndicator>
        </li>
        <li>
          <LinkWithPendingIndicator
            href="/with-root-param/pl/static-posts/125"
            prefetch={false}
          >
            Unprefetched static post 125 (pl)
          </LinkWithPendingIndicator>
        </li>
        <li>
          <LinkAccordion href="/with-root-param/fr/static-posts/1">
            Static post 1 (fr)
          </LinkAccordion>
        </li>
        <li>
          <LinkWithPendingIndicator
            href="/with-root-param/fr/static-posts/124"
            prefetch={false}
          >
            Unprefetched static post 124 (fr)
          </LinkWithPendingIndicator>
        </li>
      </ul>

      <h2>Root param via params object</h2>
      <p>
        These pages read the root param via the <code>params</code> object
        passed to the page (rather than <code>next/root-params</code>). The root
        param is available when the App Shell is prerendered, so it&apos;s
        included in the cached shell and reused for any URL with the same root
        param.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/with-root-param/en/root-param-via-params/with-session-data">
            With session data
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/with-root-param/en/root-param-via-params/without-session-data">
            Without session data
          </LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
