import { LinkAccordion } from '../components/link-accordion'

// The partial-prefetch opt-in lives on the deeply nested /a/b/c page. For a
// `prefetch={true}` link to be downgraded to a partial (PPR) prefetch, the
// `SubtreeHasPartialPrefetching` hint must propagate from that leaf up through
// the /a/b and /a layout segments to the root, where the prefetch scheduler
// reads it.
export default function Page() {
  return (
    <main>
      <h1 id="home">Home</h1>
      <ul>
        <li>
          <LinkAccordion href="/a/b/c" prefetch={true}>
            Deep route
          </LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
