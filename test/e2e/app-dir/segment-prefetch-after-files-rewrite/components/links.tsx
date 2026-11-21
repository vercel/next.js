import { LinkAccordion } from './link-accordion'

export function Links() {
  return (
    <ul>
      <li>
        <LinkAccordion href="/dynamic-page" />
      </li>
      <li>
        <LinkAccordion href="/unknown" />
      </li>
    </ul>
  )
}
