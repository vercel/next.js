import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <ul>
      <li>
        <LinkAccordion href="/x/1">/x/1</LinkAccordion>
      </li>
      <li>
        <LinkAccordion href="/x/2">/x/2</LinkAccordion>
      </li>
      <li>
        <LinkAccordion href="/y/1">/y/1</LinkAccordion>
      </li>
    </ul>
  )
}
