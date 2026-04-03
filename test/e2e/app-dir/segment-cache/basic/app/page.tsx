import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <>
      <p>
        <LinkAccordion href="/test">Go to test page</LinkAccordion>
      </p>
      <p>
        <LinkAccordion href="/cycle">Go to cycle page</LinkAccordion>
      </p>
    </>
  )
}
