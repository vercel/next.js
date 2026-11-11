import { LinkAccordion } from '../../components/link-accordion'

// Each link stays hidden until its accordion is opened, so these routes are
// prefetched only inside the `act` scope that opens it. The home page's links
// are visible as soon as it loads and prefetch the same routes outside `act`.
export default function LinkAccordionsPage() {
  return (
    <ul>
      <li>
        <LinkAccordion href="/acme/dashboard">
          Team project: acme/dashboard
        </LinkAccordion>
      </li>
      <li>
        <LinkAccordion href="/globex/portal">
          Team project: globex/portal
        </LinkAccordion>
      </li>
    </ul>
  )
}
