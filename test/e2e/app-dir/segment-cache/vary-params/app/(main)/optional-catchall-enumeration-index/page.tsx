import { LinkAccordion } from '../../../components/link-accordion'

/**
 * Index page for the optional catch-all enumeration test.
 */
export default function OptionalCatchallEnumerationIndexPage() {
  return (
    <div id="optional-catchall-enumeration-index">
      <LinkAccordion href="/optional-catchall-enumeration">
        empty slug
      </LinkAccordion>
      <LinkAccordion href="/optional-catchall-enumeration/aaa">
        aaa
      </LinkAccordion>
    </div>
  )
}
