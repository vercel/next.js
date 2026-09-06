import { LinkAccordion } from './link-accordion'

export default function Home() {
  return (
    <main>
      <h1 id="home">Home</h1>
      <ul>
        <li>
          <LinkAccordion href="/slow">slow (dynamic metadata)</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/static-meta">
            static-meta (static metadata, dynamic body)
          </LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
