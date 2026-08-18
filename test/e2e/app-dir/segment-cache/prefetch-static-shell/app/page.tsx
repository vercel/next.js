import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <main>
      <h1>Home</h1>
      <p>
        Each link below points to a route that exercises a different combination
        of the static-prefetch hint on the route tree and the per-segment
        sufficiency signal. The links are hidden behind LinkAccordion checkboxes
        so the tests control exactly when each prefetch fires.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/fully-static">Fully static</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/uses-cookies">Uses cookies</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/uses-search-params?q=test">
            Uses search params
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/uses-connection">Uses connection</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/dynamic-param/one">
            Dynamic param one
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/dynamic-param/two">
            Dynamic param two
          </LinkAccordion>
        </li>
        {/* The speculative-* routes are partial (non-eager), so their
            links use prefetch={true} to opt into the Speculative phase —
            otherwise only their App Shell would be prefetched. */}
        <li>
          <LinkAccordion href="/speculative-static" prefetch={true}>
            Speculative static
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/speculative-cookies" prefetch={true}>
            Speculative cookies
          </LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
