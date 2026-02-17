import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <main>
      <h1>Home</h1>
      <ul>
        <li>
          <LinkAccordion href="/target-page" prefetch={true}>
            /target-page (prefetch=true, instant on page)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/layout-instant" prefetch={true}>
            /layout-instant (prefetch=true, instant on layout)
          </LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
