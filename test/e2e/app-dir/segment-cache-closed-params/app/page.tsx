import Link from 'next/link'
import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <main>
      <h1>Prefetch closed parameters</h1>
      <LinkAccordion href="/products/allowed">Allowed product</LinkAccordion>
      <LinkAccordion href="/products/rejected">Rejected product</LinkAccordion>
      <Link href="/products/rejected" prefetch={false} id="navigate-rejected">
        Navigate without prefetching
      </Link>
    </main>
  )
}
