import { cacheLife } from 'next/cache'
import { DebugLinks } from '../shared'

export default async function Page() {
  'use cache'
  cacheLife('minutes')
  return (
    <main>
      <h2>Runtime</h2>
      <ul>
        <li>
          <DebugLinks href="/suspense-in-root/runtime/suspense-around-dynamic" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/runtime/valid-no-suspense-around-params/123" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/runtime/valid-no-suspense-around-search-params?foo=bar" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/runtime/missing-suspense-around-dynamic" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/runtime/missing-suspense-around-dynamic-layout" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/runtime/suspense-too-high" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/invalid-blocking-inside-static" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/runtime/invalid-blocking-inside-runtime" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/runtime/invalid-sync-io" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/runtime/valid-blocking-inside-runtime" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/runtime/valid-sync-io-in-static-parent" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/runtime/invalid-sync-io-in-runtime-with-valid-static-parent" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/runtime/invalid-sync-io-after-cache-with-cookie-input" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/runtime/invalid-sync-io-in-generate-metadata" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/runtime/valid-sync-io-in-generate-metadata-static-page" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/runtime/invalid-sync-io-in-layout-generate-metadata" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/runtime/valid-sync-io-in-layout-generate-metadata-static-page" />
        </li>
      </ul>

      <h2>Static</h2>
      <ul>
        <li>
          <DebugLinks href="/suspense-in-root/static/suspense-around-dynamic" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/missing-suspense-around-dynamic" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/missing-suspense-around-params/123" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/missing-suspense-around-search-params?foo=bar" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/missing-suspense-around-dynamic-layout" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/suspense-too-high" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/blocking-layout" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/invalid-only-loading-around-dynamic" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/missing-suspense-around-runtime" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/missing-suspense-in-parallel-route" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/missing-suspense-in-parallel-route/foo" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/missing-suspense-in-parallel-route/bar" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/invalid-client-data-blocks-validation" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/valid-client-api-in-parent/sync-io" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/valid-client-api-in-parent/dynamic-params/123" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/valid-client-api-in-parent/search-params" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/valid-client-data-does-not-block-validation" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/invalid-client-error-in-parent-blocks-children" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/invalid-client-error-in-parent-sibling" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/static/valid-client-error-in-parent-does-not-block-validation" />
        </li>
      </ul>

      <h2>Head</h2>
      <ul>
        <li>
          <DebugLinks href="/suspense-in-root/head/valid-dynamic-metadata-in-runtime" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/head/valid-runtime-metadata-in-static" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/head/valid-runtime-viewport-in-runtime" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/head/valid-dynamic-viewport-in-blocking" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/head/invalid-dynamic-viewport-in-blocking-inside-static" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/head/invalid-dynamic-viewport-in-runtime" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/head/invalid-runtime-viewport-in-static" />
        </li>
      </ul>

      <h2>Disable Validation</h2>
      <ul>
        <li>
          <DebugLinks href="/suspense-in-root/disable-validation/in-layout" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/disable-validation/in-page" />
        </li>
        <li>
          <DebugLinks href="/suspense-in-root/disable-validation/in-page-with-outer" />
        </li>
      </ul>
    </main>
  )
}
