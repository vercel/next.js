import { LinkAccordion } from '../../components/link-accordion'

// This page does NOT export staleTime - it inherits from inner layout (200 seconds)

export default function Page() {
  return (
    <>
      <div id="stale-time-nested">
        Page in nested layout - inherits staleTime 200 from inner layout
        [prefetch-sentinel]
      </div>
      <LinkAccordion href="/" id="to-home">
        To home
      </LinkAccordion>
    </>
  )
}
