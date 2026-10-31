import { LinkAccordion } from '../components/link-accordion'

export default function Home() {
  return (
    <main>
      <h1>HOME</h1>
      <ul>
        {/* Prefetching this teaches the router the /docs/[[...slug]]
            pattern (App Router optional catch-all). */}
        <li>
          <LinkAccordion href="/docs/a">Docs A</LinkAccordion>
        </li>
        {/* Click target — /docs is served by the Pages Router
            (pages/docs.tsx), which shadows the zero-segment case of the
            App Router optional catch-all. prefetch={false} so revealing
            it fires no request; the router must not fabricate an
            optimistic App Router tree for it. */}
        <li>
          <LinkAccordion href="/docs" prefetch={false}>
            Docs root
          </LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
