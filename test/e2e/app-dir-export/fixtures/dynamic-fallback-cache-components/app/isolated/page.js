import { LinkAccordion } from '../components/link-accordion'

export default function Isolated() {
  return (
    <main>
      <h1>Isolated</h1>
      <ul>
        <li>
          <LinkAccordion href="/isolated/third" prefetch={true}>
            prefetched isolated third page
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/isolated/fourth" prefetch={true}>
            prefetched isolated fourth page
          </LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
