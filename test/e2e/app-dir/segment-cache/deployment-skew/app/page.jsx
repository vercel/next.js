import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <ul>
      <li>
        <LinkAccordion href="/dynamic-page">
          Dynamic page, same deployment
        </LinkAccordion>
      </li>
      <li>
        <LinkAccordion href="/dynamic-page?deployment=2">
          Dynamic page, different deployment
        </LinkAccordion>
      </li>
      <li>
        <LinkAccordion href="/static-page">
          Static page, same deployment
        </LinkAccordion>
      </li>
      <li>
        <LinkAccordion href="/static-page?deployment=2">
          Static page, different deployment
        </LinkAccordion>
      </li>
    </ul>
  )
}
