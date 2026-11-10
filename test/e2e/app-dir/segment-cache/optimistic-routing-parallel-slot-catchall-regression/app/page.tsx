import { LinkAccordion } from '../components/link-accordion'

export default function Home() {
  return (
    <main>
      <h1>HOME</h1>
      <ul>
        <li>
          <LinkAccordion href="/myteam">Team</LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
