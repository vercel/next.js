import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <main>
      <h1>Home</h1>
      <ul>
        <li>
          <LinkAccordion href="/target-page" prefetch={true}>
            /target-page
          </LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
