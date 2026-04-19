import { LinkAccordion } from '../../components/link-accordion'

export default function FullyStaticStart() {
  return (
    <>
      <p>
        Demonstrates that when navigating to a fully prefetched route that does
        not contain any dynamic data, we do not need to perform an additional
        request on navigation.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/fully-static/target-page">Target</LinkAccordion>
        </li>
      </ul>
    </>
  )
}
