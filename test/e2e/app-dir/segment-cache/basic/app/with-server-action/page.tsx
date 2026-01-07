import { LinkAccordion } from '../../components/link-accordion'

export default function FullyStaticStart() {
  return (
    <>
      <p>
        This is a regression test case to ensure that prerendered segments that
        include server actions do not throw an error when navigating to them.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/with-server-action/target-page">
            Target
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}
