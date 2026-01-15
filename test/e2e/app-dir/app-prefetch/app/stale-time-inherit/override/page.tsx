import { LinkAccordion } from '../../components/link-accordion'

export const staleTime = 60 // 1 minute - overrides layout's 2 minutes

export default function Page() {
  return (
    <>
      <div id="stale-time-override">
        Page overrides layout staleTime to 1 minute [prefetch-sentinel]
      </div>
      <LinkAccordion href="/" id="to-home">
        To home
      </LinkAccordion>
    </>
  )
}
