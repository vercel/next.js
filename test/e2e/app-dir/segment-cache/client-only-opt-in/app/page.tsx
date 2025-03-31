import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <div>
      <h1>
        <code>clientSegmentCache: 'client-only'</code>
      </h1>
      <p>
        This page demonstrates the behavior when the experimental Segment Cache
        flag is set to <code>'client-only'</code> instead of <code>true</code>.
        The new prefetching implementation is enabled on the client, but the
        server will not generate any per-segment prefetching. This is useful
        because the client implementation has many other improvements that are
        unrelated to per-segment prefetching, like improved scheduling and
        dynamic request deduping.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/static">Static page</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/dynamic-with-ppr">
            Dynamic page (with PPR enabled)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/dynamic-without-ppr">
            Dynamic page (without PPR enabled)
          </LinkAccordion>
        </li>
      </ul>
    </div>
  )
}
