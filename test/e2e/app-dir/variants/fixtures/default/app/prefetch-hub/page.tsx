import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <>
      <LinkAccordion href="/enumerated/never-enumerated">
        Never enumerated
      </LinkAccordion>
      <LinkAccordion href="/on-demand/built">Enumerated param</LinkAccordion>
    </>
  )
}
