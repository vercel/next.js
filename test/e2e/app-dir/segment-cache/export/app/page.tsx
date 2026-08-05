import { LinkAccordion } from '../components/link-accordion'

export default function OutputExport() {
  return (
    <>
      <p>
        Demonstrates that per-segment prefetching works in{' '}
        <code>output: export</code> mode.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/target-page">Target</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/target-page" prefetch name="target-page-eager">
            Target (prefetch=true)
          </LinkAccordion>
        </li>
      </ul>
      <p>
        The following links are rewritten on the server to the same page as the
        link above:
      </p>
      <ul>
        <li>
          <LinkAccordion href="/rewrite-to-target-page">
            Rewrite to target page
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion
            href="/rewrite-to-target-page"
            prefetch
            name="rewrite-eager"
          >
            Rewrite to target page (prefetch=true)
          </LinkAccordion>
        </li>
      </ul>
      <p>
        The following links are redirected on the server to the same page as the
        link above:
      </p>
      <ul>
        <li>
          <LinkAccordion href="/redirect-to-target-page">
            Redirect to target page
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion
            href="/redirect-to-target-page"
            prefetch
            name="redirect-eager"
          >
            Redirect to target page (prefetch=true)
          </LinkAccordion>
        </li>
      </ul>
      <p>The following link points at a route with a dynamic param:</p>
      <ul>
        <li>
          <LinkAccordion href="/dynamic/first" prefetch name="dynamic-eager">
            Dynamic page
          </LinkAccordion>
        </li>
      </ul>
      <p>
        The following link points at a dynamic param that was not exported, so
        none of its segment files exist on disk:
      </p>
      <ul>
        <li>
          <LinkAccordion
            href="/dynamic/second"
            prefetch
            name="dynamic-missing-eager"
          >
            Missing dynamic page
          </LinkAccordion>
        </li>
      </ul>
      <p>The following link points at a page below two nested layouts:</p>
      <ul>
        <li>
          <LinkAccordion href="/nested/inner" prefetch name="nested-eager">
            Nested inner page
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}
