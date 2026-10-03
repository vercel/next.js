import Link from 'next/link'
import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <ul>
      <li>
        <LinkAccordion href="/dynamic" prefetch={true}>
          Dynamic page
        </LinkAccordion>
      </li>
      <li>
        <Link href="/dynamic" prefetch={false} id="link-without-prefetch">
          Dynamic page (no prefetch)
        </Link>
      </li>
      <li>
        <LinkAccordion href="/partially-static" id="partially-static-default">
          Partially static page (default prefetch)
        </LinkAccordion>
      </li>
      <li>
        <LinkAccordion
          href="/partially-static"
          prefetch={true}
          id="partially-static-full"
        >
          Partially static page (prefetch=true)
        </LinkAccordion>
      </li>
    </ul>
  )
}
