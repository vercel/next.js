import { cacheLife } from 'next/cache'
import { DebugLinks } from '../../shared'
import { Instant } from 'next'

// Skip repeatedly running instant validation on index pages during tests
export const instant: Instant = {
  unstable_disableValidation: true,
}

export default async function Page() {
  'use cache'
  cacheLife('minutes')
  return (
    <main>
      <h2>App Shells</h2>
      <ul>
        <li>
          <DebugLinks href="/shells/valid-session-only" />
        </li>
        <li>
          <DebugLinks href="/shells/valid-session-with-dynamic" />
        </li>
        <li>
          <DebugLinks href="/shells/valid-static-with-gsp/123" />
        </li>
        <li>
          <DebugLinks href="/shells/valid-use-cache-instant-false" />
        </li>
        <li>
          <DebugLinks href="/shells/invalid-runtime-params/123" />
        </li>
        <li>
          <DebugLinks href="/shells/invalid-runtime-searchparams?foo=bar" />
        </li>
        <li>
          <DebugLinks href="/shells/invalid-static-with-gsp/123" />
        </li>
        <li>
          <DebugLinks href="/shells/invalid-static-with-gsp-metadata/123" />
        </li>
        <li>
          <DebugLinks href="/shells/invalid-navigation-without-suspense" />
        </li>
        <li>
          <DebugLinks href="/shells/valid-navigation-with-suspense" />
        </li>
        <li>
          <DebugLinks href="/shells/invalid-prefetch-without-suspense" />
        </li>
        <li>
          <DebugLinks href="/shells/valid-prefetch-with-suspense" />
        </li>
      </ul>
    </main>
  )
}
