import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <main>
      <h1>Home</h1>
      <ul>
        <li>
          <LinkAccordion href="/posts/1">Post 1 (default)</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/posts/2">Post 2 (default)</LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
