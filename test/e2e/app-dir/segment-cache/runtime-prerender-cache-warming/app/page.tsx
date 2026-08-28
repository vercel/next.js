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
          <LinkAccordion href="/pass-prefetch-to-cache">
            /pass-prefetch-to-cache
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/pass-navigation-to-cache" prefetch={true}>
            /pass-navigation-to-cache (prefetch=true)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/lazy-data-in-shell">
            /lazy-data-in-shell
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/lazy-data-in-prefetch" prefetch={true}>
            /lazy-data-in-prefetch (prefetch=true)
          </LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
