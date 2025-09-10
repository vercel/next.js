import { LinkAccordion } from './link-accordion'

export default function Page() {
  return (
    <>
      <p>
        This page is used to test that if you prefetch a link multiple times,
        the prefetches are deduped by the client cache (unless/until they become
        stale). The e2e associated with this page works by toggling the
        visibility of the links and checking whether any prefetch requests are
        issued.
      </p>
      <p>
        You can test the behavior manually by opening up the network tab in the
        browser's DevTools and seeing what happens when you toggle a Link's
        visibility.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/ppr-enabled">
            Page with PPR enabled
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/ppr-enabled/dynamic-param">
            Page with PPR enabled but has dynamic param
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/ppr-disabled">
            Page with PPR disabled
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/ppr-disabled-with-loading-boundary">
            Page with PPR disabled, but has a loading boundary
          </LinkAccordion>
          <ul>
            <li>
              <LinkAccordion href="/ppr-disabled-with-loading-boundary/child">
                Another dynamic page that shares the same loading boundary
              </LinkAccordion>
            </li>
          </ul>
        </li>
        <li>
          <LinkAccordion
            prefetch={true}
            href="/ppr-disabled-dynamic-head?foo=yay"
          >
            Page with PPR disabled and a dynamic head, prefetch=true
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}
