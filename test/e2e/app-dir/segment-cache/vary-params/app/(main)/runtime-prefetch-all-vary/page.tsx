import { LinkAccordion } from '../../../components/link-accordion'

export default function RuntimePrefetchAllVaryIndexPage() {
  return (
    <div id="runtime-prefetch-all-vary-index">
      <h1>Runtime Prefetch - All Params in Static Portion</h1>
      <ul>
        <li>
          <LinkAccordion href="/runtime-prefetch-all-vary/electronics/phone">
            Electronics: Phone
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/runtime-prefetch-all-vary/electronics/tablet">
            Electronics: Tablet
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/runtime-prefetch-all-vary/clothing/shirt">
            Clothing: Shirt
          </LinkAccordion>
        </li>
      </ul>
    </div>
  )
}
