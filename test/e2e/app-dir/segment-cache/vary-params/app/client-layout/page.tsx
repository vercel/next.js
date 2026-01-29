import { LinkAccordion } from '../../components/link-accordion'

export default function ClientLayoutIndexPage() {
  return (
    <div id="client-layout-index">
      <h1>Client Layout Index</h1>
      <ul>
        <li>
          <LinkAccordion href="/client-layout/aaa">Link to aaa</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/client-layout/bbb">Link to bbb</LinkAccordion>
        </li>
      </ul>
    </div>
  )
}
