import { LinkAccordion } from '../components/link-accordion'

export const staleTime = 0 // Immediate cache invalidation

export default function Page() {
  return (
    <>
      <div id="stale-time-zero">
        Page with staleTime=0 (immediate invalidation) [prefetch-sentinel]
      </div>
      <LinkAccordion href="/" id="to-home">
        To home
      </LinkAccordion>
    </>
  )
}
