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
    </ul>
  )
}
