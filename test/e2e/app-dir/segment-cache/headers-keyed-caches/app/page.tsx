import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <main>
      <h1>Index</h1>
      <ul>
        <li>
          <LinkAccordion href="/dynamic">Dynamic page</LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
