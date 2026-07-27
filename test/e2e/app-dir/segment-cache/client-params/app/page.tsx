import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <>
      <ul>
        <li>
          <LinkAccordion href="/clothing/1">/clothing/1</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/clothing/2">/clothing/2</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/shoes/3">/shoes/3</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/shoes/4?foo=bar">
            /shoes/4?foo=bar
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}
