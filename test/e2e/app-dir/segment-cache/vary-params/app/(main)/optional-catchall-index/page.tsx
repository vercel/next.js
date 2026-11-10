import { LinkAccordion } from '../../../components/link-accordion'

/**
 * Index page for the optional catch-all direct access test.
 */
export default function OptionalCatchallIndexPage() {
  return (
    <div id="optional-catchall-index">
      <LinkAccordion href="/optional-catchall">empty slug</LinkAccordion>
      <LinkAccordion href="/optional-catchall/aaa">aaa</LinkAccordion>
      <LinkAccordion href="/optional-catchall/bbb">bbb</LinkAccordion>
    </div>
  )
}
