import { LinkAccordion } from '../components/link-accordion'

// This page does NOT export staleTime - it inherits from layout (2 minutes)

export default function Page() {
  return (
    <>
      <div id="stale-time-inherit">
        Page inherits staleTime from layout (2 minutes) [prefetch-sentinel]
      </div>
      <LinkAccordion href="/" id="to-home">
        To home
      </LinkAccordion>
    </>
  )
}
