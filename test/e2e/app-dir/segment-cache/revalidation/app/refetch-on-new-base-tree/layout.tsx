import { LinkAccordion } from '../../components/link-accordion'

export default function RefetchOnNewBaseTreeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <div style={{ backgroundColor: 'lightgray', padding: '1rem' }}>
        <p>
          This demonstrates what happens when a link is prefetched using{' '}
          <code>{'prefetch="unstable_forceStale"'}</code> and the URL changes.
          Next.js should re-prefetch the link in case the delta between the base
          tree and the target tree has changed.
        </p>
        <p>
          Everything in this gray section is part of a shared layout. The links
          below are prefetched using{' '}
          <code>{'prefetch="unstable_forceStale"'}</code>. If the first loaded
          page is "/refetch-on-new-base-tree/a", the prefetch for this link will
          be empty, because there's no delta between the base tree and the
          target tree.
        </p>
        <p>
          However, if you then navigate to page B, we should re-prefetch the
          link to A, because the delta between the base tree and the target tree
          is now different.
        </p>
        <p>Test steps:</p>
        <ul>
          <li>Load "/refetch-on-new-base-tree/a" in the browser.</li>
          <li>
            Click the checkboxes to reveal the links. (These exist so the e2e
            test can control the timing of the prefetch.)
          </li>
          <li>
            Observe that the prefetch for page A is empty, i.e. the string "Page
            A content" should not appear anywhere in the response.
          </li>
          <li>Click the link to page B to navigate away.</li>
          <li>
            Check the network tab to confirm that a new prefetch for page A was
            requested.
          </li>
          <li>Click the link to page A</li>
          <li>
            Observe that no new request was made when navigating to page A,
            because it was fully prefetched.
          </li>
        </ul>
        <LinkAccordion
          prefetch="unstable_forceStale"
          href="/refetch-on-new-base-tree/a"
        >
          Page A
        </LinkAccordion>
        <LinkAccordion
          prefetch="unstable_forceStale"
          href="/refetch-on-new-base-tree/b"
        >
          Page B
        </LinkAccordion>
      </div>
      <div>{children}</div>
    </>
  )
}
