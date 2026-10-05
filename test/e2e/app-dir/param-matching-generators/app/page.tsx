import Link from 'next/link'
import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <>
      <Link href="/closed/allowed" prefetch={false}>
        Closed route
      </Link>
      <Link href="/mixed/en/allowed" prefetch={false}>
        Closed prefix, open suffix
      </Link>
      <div id="mixed-prefetch">
        <LinkAccordion href="/mixed/en/allowed">
          Prefetch closed prefix, open suffix
        </LinkAccordion>
      </div>
    </>
  )
}
