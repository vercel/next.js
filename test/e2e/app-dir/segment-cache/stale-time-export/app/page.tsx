import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <>
      <p>Tests for export const unstable_staleTime segment config.</p>
      <ul>
        <li>
          <LinkAccordion href="/static-5-minutes">
            Page with unstable_staleTime static=300 (5 minutes)
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/dynamic-5-minutes">
            Page with unstable_staleTime dynamic=300 (5 minutes)
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}
