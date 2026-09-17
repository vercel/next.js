import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <>
      <h1 id="home-heading">Home</h1>
      <ul>
        <li>
          <LinkAccordion href="/stalled-page">Stalled page</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/other">Other page</LinkAccordion>
        </li>
      </ul>
    </>
  )
}
