import { LinkAccordion } from '../../../components/link-accordion'

export default function Page() {
  return (
    <>
      <h1>Cache revalidation</h1>
      <LinkAccordion href="/rdc" prefetch={false}>
        Cached page
      </LinkAccordion>
      <LinkAccordion href="/rdc" prefetch={true}>
        Cached page
      </LinkAccordion>
    </>
  )
}
