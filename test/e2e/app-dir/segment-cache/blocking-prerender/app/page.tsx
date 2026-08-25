import { LinkAccordion } from '../components/link-accordion'

export default function HomePage() {
  return (
    <ul>
      <li>
        <LinkAccordion href="/cached-layout/prerendered">
          Prerendered at build time
        </LinkAccordion>
      </li>
      <li>
        <LinkAccordion href="/cached-layout/on-demand">
          Prerendered on demand
        </LinkAccordion>
      </li>
    </ul>
  )
}
