import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <ul>
      <li>
        <LinkAccordion href="/target-page">Target page</LinkAccordion>
      </li>
      <li>
        <LinkAccordion href="/redirect-to-target-page">
          Redirects to target page
        </LinkAccordion>
      </li>
    </ul>
  )
}
