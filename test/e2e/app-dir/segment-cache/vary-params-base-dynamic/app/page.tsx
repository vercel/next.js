import { LinkAccordion } from '../components/link-accordion'

export default function HomePage() {
  return (
    <div id="home-page">
      <h1>Root Dynamic Route Vary Params</h1>
      <p>
        Prefetch dynamic team/project routes and validate segment payload
        params.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/acme/dashboard">
            Team project: acme/dashboard
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/globex/portal">
            Team project: globex/portal
          </LinkAccordion>
        </li>
      </ul>
    </div>
  )
}
