import { LinkAccordion } from '../components/link-accordion'

export const staleTime = 300 // 5 minutes

export default function Page() {
  return (
    <>
      <div id="stale-time-static">
        Static page with export staleTime of 5 minutes [prefetch-sentinel]
      </div>
      <LinkAccordion href="/" id="to-home">
        To home
      </LinkAccordion>
    </>
  )
}
