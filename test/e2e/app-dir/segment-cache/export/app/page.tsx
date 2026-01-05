import { LinkAccordion } from '../components/link-accordion'
import { MultiPrefetchLinks } from '../components/multi-prefetch-links'

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
      <p>
        Test for issue #88032: multiple Links with same href but different
        prefetch values
      </p>
      <ul>
        <li>
          <MultiPrefetchLinks href="/blog/post-1">
            Blog post 1
          </MultiPrefetchLinks>
        </li>
      </ul>
    </>
  )
}
