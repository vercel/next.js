import { DebugLinkAccordion } from '../../../components/link-accordion'

export default async function Page() {
  return (
    <main>
      <h1>Errors</h1>

      <h2>thrown errors</h2>
      <ul>
        <li>
          <DebugLinkAccordion
            href="/errors/error-after-cookies"
            prefetch={true}
          />
        </li>
      </ul>

      <h2>sync IO</h2>
      <ul>
        <li>
          <DebugLinkAccordion
            href="/errors/sync-io-after-runtime-api/cookies"
            prefetch={true}
          />
        </li>
        <li>
          <DebugLinkAccordion
            href="/errors/sync-io-after-runtime-api/headers"
            prefetch={true}
          />
        </li>
        <li>
          <DebugLinkAccordion
            href="/errors/sync-io-after-runtime-api/dynamic-params/123"
            prefetch={true}
          />
        </li>
        <li>
          <DebugLinkAccordion
            href="/errors/sync-io-after-runtime-api/search-params?foo=bar"
            prefetch={true}
          />
        </li>
        <li>
          <DebugLinkAccordion
            href="/errors/sync-io-after-runtime-api/private-cache"
            prefetch={true}
          />
        </li>
        <li>
          <DebugLinkAccordion
            href="/errors/sync-io-after-runtime-api/quickly-expiring-public-cache"
            prefetch={true}
          />
        </li>
      </ul>
    </main>
  )
}
