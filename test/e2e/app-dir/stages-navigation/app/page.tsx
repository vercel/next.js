import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <main>
      <h1>Stages navigation home</h1>
      <ul>
        <li>
          {/* Use a full prefetch: the suite asserts that a prefetch of this
              fully static page includes everything, by navigating without any
              additional requests. (The app enables `partialPrefetching`, so a
              default prefetch would be deliberately partial.) */}
          <LinkAccordion href="/basic" prefetch={true}>
            Basic
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/workaround">Workaround</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/runtime-prefetch">
            Runtime prefetch
          </LinkAccordion>
        </li>
        <li>
          {/* Second accordion to the same href, but at navigation depth.
              Revealing this link issues a runtime prefetch that renders past
              `await unstable_navigation()`. */}
          <LinkAccordion href="/runtime-prefetch" prefetch="navigation">
            Runtime prefetch (navigation depth)
          </LinkAccordion>
        </li>
        <li>
          {/* Third accordion to the same href, with a full prefetch. Under
              Cache Components, `prefetch={true}` uses the same two-phase flow
              as the default prefetch, but additionally performs the
              speculative per-link pass, which issues a standalone runtime
              prefetch for the page (it opts in via
              `prefetch = 'partial'`). The suite uses this to put
              runtime-depth entries in the cache before revealing a
              navigation-depth link to the same route. */}
          <LinkAccordion href="/runtime-prefetch" prefetch={true}>
            Runtime prefetch (full)
          </LinkAccordion>
        </li>
        <li>
          {/* Full prefetch: issues a standalone runtime prefetch for the
              page (see the comment on the equivalent /runtime-prefetch
              accordion above). */}
          <LinkAccordion href="/runtime-ungated" prefetch={true}>
            Runtime ungated (full)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/runtime-ungated" prefetch="navigation">
            Runtime ungated (navigation depth)
          </LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
