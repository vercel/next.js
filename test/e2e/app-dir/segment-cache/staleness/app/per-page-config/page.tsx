import { LinkAccordion } from '../../components/link-accordion'

export default function Page() {
  return (
    <>
      <p>
        This page tests per-page dynamic stale time configuration via{' '}
        <code>export const unstable_dynamicStaleTime</code>.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/per-page-config/dynamic-stale-60">
            Dynamic page with stale time of 60 seconds
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/per-page-config/dynamic-stale-10">
            Dynamic page with stale time of 10 seconds
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/per-page-config/parallel-slots">
            Parallel routes with slots having different stale times (60s and
            15s)
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}
