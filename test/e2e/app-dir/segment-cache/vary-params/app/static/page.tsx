import { LinkAccordion } from '../../components/link-accordion'

export default function StaticPage() {
  return (
    <div id="index-page">
      <h1>Index Page</h1>
      <ul>
        <li>
          <LinkAccordion href="/static/aaa">Link to aaa</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/static/bbb">Link to bbb</LinkAccordion>
        </li>
      </ul>
    </div>
  )
}
