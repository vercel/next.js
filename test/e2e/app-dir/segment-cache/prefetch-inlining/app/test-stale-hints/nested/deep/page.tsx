import { LinkAccordion } from '../../../../components/link-accordion'

// This page is the target for the stale hints test. It has multiple small
// parent layouts that would all be inlined. When the client loads this page
// via HTML, the initial tree doesn't have correct inlining hints. After
// navigating away and prefetching back, the client must not use the stale
// hints from the initial load.
export default function Page() {
  return (
    <div>
      <p id="page-stale-hints">Stale hints page</p>
      <LinkAccordion href="/">Go home</LinkAccordion>
    </div>
  )
}
