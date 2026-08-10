import { LinkAccordion } from '../components/link-accordion'

export default function Home() {
  return (
    <main>
      <h1>HOME</h1>
      <ul>
        {/* The four prefetch URLs below each arrive via a rewrite that
            produces a route shape the URL would not naturally route to.
            Each test reveals one of them (default prefetch=true) to
            populate the router's prediction state, then clicks one of
            the click-targets below to check that no incorrect prediction
            was learned. */}
        <li>
          <LinkAccordion href="/myteam/garbage">Tree-shorter</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/featured">Static-sibling</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/team-shorter">
            Static-visible-null
          </LinkAccordion>
        </li>

        {/* Click target — prefetch={false} so revealing it fires no
            request. Inside an act scope, the test clicks this and
            asserts that no /[teamSlug] loading boundary appears
            instantly (which would only happen if the router had a
            cached prediction for it). */}
        <li>
          <LinkAccordion href="/yourteam" prefetch={false}>
            Your team
          </LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
