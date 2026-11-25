import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <ul>
      <li>
        <LinkAccordion href="/client-page">client page</LinkAccordion>
      </li>
      <li>
        <LinkAccordion href="/server-page">server page</LinkAccordion>
      </li>
    </ul>
  )
}
