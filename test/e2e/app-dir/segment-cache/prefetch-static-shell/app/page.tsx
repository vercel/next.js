import Link from 'next/link'
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
          <LinkAccordion href="/runtime-called-but-not-awaited">
            Calls Runtime APIs but does not await them
          </LinkAccordion>
        </li>
        <li>
          Params after dynamic content
          <ul>
            <li>
              <LinkAccordion href="/params-used-after-dynamic/1">
                Param 1
              </LinkAccordion>
            </li>
            <li>
              <Link href="/params-used-after-dynamic/2" prefetch={false}>
                Param 2 (unprefetched)
              </Link>
            </li>
          </ul>
        </li>
        <li>
          Params after navigation()
          <ul>
            <li>
              <LinkAccordion href="/params-used-after-navigation/1">
                Param 1
              </LinkAccordion>
            </li>
            <li>
              <Link href="/params-used-after-navigation/2" prefetch={false}>
                Param 2 (unprefetched)
              </Link>
            </li>
          </ul>
        </li>
        <li>
          Params used in icon
          <ul>
            <li>
              <LinkAccordion href="/params-used-in-icon/1">
                Param 1
              </LinkAccordion>
            </li>
            <li>
              <Link href="/params-used-in-icon/2" prefetch={false}>
                Params 2
              </Link>
            </li>
          </ul>
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
          <LinkAccordion href="/uses-runtime-after-navigation">
            Uses runtime APIs after navigation()
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/uses-navigation-static">
            Uses navigation() on a static page
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/uses-runtime-after-prefetch">
            Uses runtime APIs after prefetch()
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/uses-prefetch-static">
            Uses prefetch() on a static page
          </LinkAccordion>
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
