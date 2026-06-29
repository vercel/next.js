import { LinkAccordion } from '../../../components/link-accordion'

/**
 * Index page for the root params vary test.
 *
 * This page links to routes that use the rootParams() API from next/navigation.
 * The target routes are at /aaa and /bbb which have their own root layout
 * (no shared app/layout.tsx above them), making `rootParam` a true "root param".
 *
 * Setup:
 * - /aaa and /bbb have layouts that call rootParams()
 * - The rootParam value is accessed in both layout and page
 *
 * Expected behavior:
 * - Prefetching /aaa fetches the content
 * - Prefetching /bbb triggers a NEW request (not a cache hit)
 *   because rootParam is tracked in varyParams
 *
 * Manual testing:
 * 1. Click checkbox for "aaa" — triggers prefetch, content fetched
 * 2. Click checkbox for "bbb" — should also fetch (not cached)
 */
export default function RootParamsIndexPage() {
  return (
    <div id="root-params-index">
      <h1>Root Params Vary Test</h1>
      <p>
        Tests that root param access via rootParams() API is tracked in
        varyParams.
      </p>
      <ul>
        <li>
          <LinkAccordion href="/aaa">Root Param: aaa</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/bbb">Root Param: bbb</LinkAccordion>
        </li>
      </ul>
    </div>
  )
}
