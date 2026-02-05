import { DebugLinkMPA } from '../../components/debug-link'
import { cacheLife } from 'next/cache'

export default async function Page() {
  'use cache'
  cacheLife('minutes')
  return (
    <main>
      <h2>Runtime</h2>
      <ul>
        <li>
          <DebugLinkMPA href="/runtime/suspense-around-dynamic" />
        </li>
        <li>
          <DebugLinkMPA href="/runtime/no-suspense-around-params/123" />
        </li>
        <li>
          <DebugLinkMPA href="/runtime/missing-suspense-around-dynamic" />
        </li>
        <li>
          <DebugLinkMPA href="/runtime/missing-suspense-around-dynamic-layout" />
        </li>
        <li>
          <DebugLinkMPA href="/runtime/suspense-too-high" />
        </li>
        <li>
          <DebugLinkMPA href="/runtime/invalid-blocking-inside-runtime" />
        </li>
        <li>
          <DebugLinkMPA href="/runtime/invalid-sync-io" />
        </li>
        <li>
          <DebugLinkMPA href="/runtime/valid-blocking-inside-runtime" />
        </li>
      </ul>

      <h2>Static</h2>
      <ul>
        <li>
          <DebugLinkMPA href="/static/suspense-around-dynamic" />
        </li>
        <li>
          <DebugLinkMPA href="/static/missing-suspense-around-dynamic" />
        </li>
        <li>
          <DebugLinkMPA href="/static/missing-suspense-around-params/123" />
        </li>
        <li>
          <DebugLinkMPA href="/static/missing-suspense-around-dynamic-layout" />
        </li>
        <li>
          <DebugLinkMPA href="/static/suspense-too-high" />
        </li>
        <li>
          <DebugLinkMPA href="/static/blocking-layout" />
        </li>
        <li>
          <DebugLinkMPA href="/static/blocking-layout/missing-suspense-around-dynamic" />
        </li>
        <li>
          <DebugLinkMPA href="/static/invalid-only-loading-around-dynamic" />
        </li>
        <li>
          <DebugLinkMPA href="/static/missing-suspense-around-runtime" />
        </li>
        <li>
          <DebugLinkMPA href="/static/missing-suspense-in-parallel-route" />
        </li>
        <li>
          <DebugLinkMPA href="/static/missing-suspense-in-parallel-route/foo" />
        </li>
        <li>
          <DebugLinkMPA href="/static/missing-suspense-in-parallel-route/bar" />
        </li>
        <li>
          <DebugLinkMPA href="/static/invalid-blocking-inside-static" />
        </li>
        <li>
          <DebugLinkMPA href="/static/valid-blocked-children" />
        </li>
        <li>
          <DebugLinkMPA href="/static/valid-blocking-inside-static" />
        </li>
      </ul>

      <h2>Disable Validation</h2>
      <ul>
        <li>
          <DebugLinkMPA href="/disable-validation/in-layout" />
        </li>
        <li>
          <DebugLinkMPA href="/disable-validation/in-page" />
        </li>
        <li>
          <DebugLinkMPA href="/disable-validation/in-page-with-outer" />
        </li>
      </ul>
    </main>
  )
}
