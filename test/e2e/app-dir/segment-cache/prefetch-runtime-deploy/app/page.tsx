import { LinkAccordion } from '../components/link-accordion'

export default function HomePage() {
  return (
    <main>
      <h1>Home</h1>
      <ul>
        <li>
          <LinkAccordion href="/composer">Composer</LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
