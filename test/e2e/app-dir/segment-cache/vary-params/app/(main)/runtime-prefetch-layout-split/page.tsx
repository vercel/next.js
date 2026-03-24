import { LinkAccordion } from '../../../components/link-accordion'

export default function RuntimePrefetchLayoutSplitIndexPage() {
  return (
    <div id="runtime-prefetch-layout-split-index">
      <h1>Runtime Prefetch - Layout/Page Param Split</h1>
      <ul>
        <li>
          <LinkAccordion href="/runtime-prefetch-layout-split/electronics/phone">
            Electronics: Phone
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/runtime-prefetch-layout-split/electronics/tablet">
            Electronics: Tablet
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/runtime-prefetch-layout-split/clothing/shirt">
            Clothing: Shirt
          </LinkAccordion>
        </li>
      </ul>
    </div>
  )
}
