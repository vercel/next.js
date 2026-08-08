import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <main>
      <ul>
        <li>
          <LinkAccordion href="/slug/prerendered">
            prerendered from gSP - /slug/prerendered
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/slug/not-prerendered">
            not prerendered - /slug/not-prerendered
          </LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
