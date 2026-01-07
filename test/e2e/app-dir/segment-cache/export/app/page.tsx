import { LinkAccordion } from '../components/link-accordion'

export default function OutputExport() {
  return (
    <>
      <p>
        Demonstrates that per-segment prefetching works in{' '}
        <code>output: export</code> mode.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/target-page">Target</LinkAccordion>
        </li>
      </ul>
      <p>
        The following link is rewritten on the server to the same page as the
        link above:
      </p>
      <ul>
        <li>
          <LinkAccordion href="/rewrite-to-target-page">
            Rewrite to target page
          </LinkAccordion>
        </li>
      </ul>
      <p>
        The following link is redirected on the server to the same page as the
        link above:
      </p>
      <ul>
        <li>
          <LinkAccordion href="/redirect-to-target-page">
            Redirect to target page
          </LinkAccordion>
        </li>
      </ul>
    </>
  )
}
