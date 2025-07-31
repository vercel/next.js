import { LinkAccordion } from './link-accordion'

export default function Page() {
  return (
    <>
      <ul>
        <li>
          <LinkAccordion prefetch={true} href="/page-with-dynamic-head">
            Page with dynamic head (prefetch=true))
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion
            prefetch={true}
            href="/rewrite-to-page-with-dynamic-head"
          >
            Rewrite to page with dynamic head (prefetch=true)
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}
