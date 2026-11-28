import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <>
      <p id="home">home</p>
      <ul>
        <li>
          <LinkAccordion href="/client-page">client page</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/server-page">server page</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/plain">plain page</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/dynamic/first">dynamic page</LinkAccordion>
        </li>
      </ul>
    </>
  )
}
