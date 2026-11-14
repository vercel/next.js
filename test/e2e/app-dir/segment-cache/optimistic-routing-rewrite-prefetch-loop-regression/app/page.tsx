import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <ul>
      <li>
        <LinkAccordion href="/docs/one">/docs/one</LinkAccordion>
      </li>
      <li>
        <LinkAccordion href="/old" prefetch={true}>
          /old
        </LinkAccordion>
      </li>
    </ul>
  )
}
