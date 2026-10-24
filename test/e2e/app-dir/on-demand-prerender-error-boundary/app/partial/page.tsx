import { LinkAccordion } from '../../link-accordion'

export default function Page() {
  return (
    <>
      <LinkAccordion href="/partial/suspense-error">
        Open error inside Suspense
      </LinkAccordion>
      <LinkAccordion href="/partial/error">Open error</LinkAccordion>
    </>
  )
}
