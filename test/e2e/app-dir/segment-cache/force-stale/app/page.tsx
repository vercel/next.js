import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <LinkAccordion href="/dynamic" prefetch={true}>
      Dynamic page
    </LinkAccordion>
  )
}
