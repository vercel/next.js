import { LinkAccordion } from '../../components/link-accordion'

export default function DynamicParamHub() {
  return (
    <main>
      <h1>Dynamic Param Hub</h1>
      <ul>
        <li>
          <LinkAccordion href="/dynamic-param/a" prefetch={true}>
            /dynamic-param/a (prefetch=true)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/dynamic-param/b" prefetch={false}>
            /dynamic-param/b
          </LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
