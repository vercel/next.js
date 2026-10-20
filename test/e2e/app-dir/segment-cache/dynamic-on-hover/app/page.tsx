import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <>
      <LinkAccordion unstable_dynamicOnHover href="/dynamic">
        Dynamic page
      </LinkAccordion>
      <LinkAccordion unstable_dynamicOnHover href="/partial">
        Partial page
      </LinkAccordion>
    </>
  )
}
