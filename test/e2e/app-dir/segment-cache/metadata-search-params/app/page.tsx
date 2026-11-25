import { LinkAccordion } from './link-accordion'

export default function Home() {
  return (
    <ul>
      <li>
        <LinkAccordion href="/search?q=alpha">alpha</LinkAccordion>
      </li>
      <li>
        <LinkAccordion href="/search?q=beta">beta</LinkAccordion>
      </li>
    </ul>
  )
}
