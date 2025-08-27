import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <main>
      <ul>
        <li>
          <LinkAccordion href="/prefetch-static">
            /prefetch-static
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/prefetch-runtime">
            /prefetch-runtime
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/nested-prefetch-static">
            /nested-prefetch-static
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/no-prefetch">/no-prefetch</LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
