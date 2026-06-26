import { LinkAccordion } from '../../../components/link-accordion'

/**
 * Index page for the optional catch-all `in` operator test.
 */
export default function OptionalCatchallHasIndexPage() {
  return (
    <div id="optional-catchall-has-index">
      <LinkAccordion href="/optional-catchall-has">empty slug</LinkAccordion>
      <LinkAccordion href="/optional-catchall-has/aaa">aaa</LinkAccordion>
    </div>
  )
}
