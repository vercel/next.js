import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <main>
      <h1>Home</h1>
      <ul>
        <li>
          <LinkAccordion href="/default-route" prefetch={true}>
            /default-route
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/partial-route" prefetch={true}>
            /partial-route
          </LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
