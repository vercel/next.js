import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <>
      <p>hello world</p>
      <LinkAccordion href="/dynamic-metadata/partial" prefetch={true}>
        Prefetch metadata page
      </LinkAccordion>
    </>
  )
}
