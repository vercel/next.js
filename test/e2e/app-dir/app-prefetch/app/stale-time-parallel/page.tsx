import { LinkAccordion } from '../components/link-accordion'

// Main page has no staleTime export

export default function Page() {
  return (
    <>
      <div id="stale-time-parallel">
        Parallel routes page (no staleTime in main) [prefetch-sentinel]
      </div>
      <LinkAccordion href="/" id="to-home">
        To home
      </LinkAccordion>
    </>
  )
}
