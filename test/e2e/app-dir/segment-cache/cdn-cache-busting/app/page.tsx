import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <div>
      <h2>auto prefetches</h2>
      <ul id="prefetch-auto">
        <li>
          <LinkAccordion href="/target-page">Target page</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/redirect-to-target-page">
            Redirects to target page
          </LinkAccordion>
        </li>
      </ul>

      {process.env.__NEXT_CACHE_COMPONENTS && (
        // runtime prefetches are only available if cacheComponents is enabled.
        <>
          <h2>runtime prefetches</h2>
          <ul id="prefetch-runtime">
            <li>
              <LinkAccordion href="/target-page" prefetch={true}>
                Target page
              </LinkAccordion>
            </li>
            <li>
              <LinkAccordion href="/redirect-to-target-page" prefetch={true}>
                Redirects to target page
              </LinkAccordion>
            </li>
          </ul>
        </>
      )}
    </div>
  )
}
