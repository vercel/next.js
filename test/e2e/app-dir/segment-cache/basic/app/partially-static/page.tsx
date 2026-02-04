import { LinkAccordion } from '../../components/link-accordion'

export default function FullyStaticStart() {
  return (
    <>
      <p>
        Demonstrates that when navigating to a partially static route, the
        server does not render static layouts that were already prefetched.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/partially-static/target-page">
            Target
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}
