import { cacheLife } from 'next/cache'
import { DebugLinks } from '../shared'

export default async function Page() {
  'use cache'
  cacheLife('minutes')
  return (
    <main>
      <h2>Static</h2>
      <ul>
        <li>
          <DebugLinks href="/default/static/valid-blocked-children" />
        </li>
        <li>
          <DebugLinks href="/default/static/valid-blocking-inside-static" />
        </li>
        <li>
          <DebugLinks href="/default/invalid-use-selected-layout-segment-no-samples/123" />
        </li>
        <li>
          <DebugLinks href="/default/invalid-use-selected-layout-segments-no-samples/123" />
        </li>
      </ul>
    </main>
  )
}
