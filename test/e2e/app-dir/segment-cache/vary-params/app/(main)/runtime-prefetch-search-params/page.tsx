import { LinkAccordion } from '../../../components/link-accordion'

export default function RuntimePrefetchSearchParamsIndexPage() {
  return (
    <div id="runtime-prefetch-search-params-index">
      <h1>Runtime Prefetch - SearchParams Not Accessed</h1>
      <ul>
        <li>
          <LinkAccordion href="/runtime-prefetch-search-params/target-page?q=1">
            Target q=1
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/runtime-prefetch-search-params/target-page?q=2">
            Target q=2
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/runtime-prefetch-search-params/target-page?q=3">
            Target q=3
          </LinkAccordion>
        </li>
      </ul>
    </div>
  )
}
