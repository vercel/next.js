import { LinkAccordion } from '../../../components/link-accordion'

export default function RuntimePrefetchNoVaryIndexPage() {
  return (
    <div id="runtime-prefetch-no-vary-index">
      <h1>Runtime Prefetch - No Params in Static Portion</h1>
      <ul>
        <li>
          <LinkAccordion
            href="/runtime-prefetch-no-vary/electronics/phone"
            prefetch
          >
            Electronics: Phone
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion
            href="/runtime-prefetch-no-vary/electronics/tablet"
            prefetch
          >
            Electronics: Tablet
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion
            href="/runtime-prefetch-no-vary/clothing/shirt"
            prefetch
          >
            Clothing: Shirt
          </LinkAccordion>
        </li>
      </ul>
    </div>
  )
}
